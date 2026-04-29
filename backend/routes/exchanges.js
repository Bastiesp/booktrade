const express = require('express');
const auth = require('../middleware/auth');
const Exchange = require('../models/Exchange');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Book = require('../models/Book');

const router = express.Router();

function levelFor(n) {
  n = Number(n || 0);
  if (n >= 35) return 'Oro';
  if (n >= 15) return 'Plata';
  if (n >= 7) return 'Bronce';
  return 'Aficionado';
}

function exchangeState(exchange, userId) {
  const confirmations = exchange.confirmations || [];
  const mine = confirmations.some(c => String(c.user?._id || c.user) === String(userId));
  const other = confirmations.some(c => String(c.user?._id || c.user) !== String(userId));

  if (exchange.status === 'completed') {
    return {
      label: 'Intercambio hecho',
      code: 'exchange_done',
      mineConfirmed: true,
      otherConfirmed: true
    };
  }

  if (mine && other) {
    return {
      label: 'Listo para completar',
      code: 'ready',
      mineConfirmed: true,
      otherConfirmed: true
    };
  }

  if (mine && !other) {
    return {
      label: 'Esperando confirmación de la otra persona',
      code: 'waiting_other',
      mineConfirmed: true,
      otherConfirmed: false
    };
  }

  if (!mine && other) {
    return {
      label: 'Falta tu confirmación',
      code: 'waiting_me',
      mineConfirmed: false,
      otherConfirmed: true
    };
  }

  return {
    label: 'Coordinando',
    code: 'coordinating',
    mineConfirmed: false,
    otherConfirmed: false
  };
}

async function updateUserLevel(userId) {
  const user = await User.findById(userId);
  if (!user) return null;

  const prev = user.level || levelFor(user.completedExchanges || 0);
  user.level = levelFor(user.completedExchanges || 0);
  await user.save();

  if (prev !== user.level) {
    await Notification.create({
      user: user._id,
      type: 'level_up',
      title: `Subiste a nivel ${user.level}`,
      body: `Ahora tienes ${user.completedExchanges} intercambios completados.`,
      data: { level: user.level }
    });
  }

  return user;
}


function idOf(v) {
  return String(v?._id || v?.id || v || '');
}

async function applyCompletedExchangeBookOwners(exchange) {
  if (!exchange || exchange.status !== 'completed') return false;

  const requesterId = idOf(exchange.requester);
  const matchedUserId = idOf(exchange.matchedUser);
  const myBookId = idOf(exchange.myBook);
  const theirBookId = idOf(exchange.theirBook);

  if (!requesterId || !matchedUserId || !myBookId || !theirBookId) return false;

  /*
    Regla final:
    - myBook era el libro que entregaba el requester.
      Por lo tanto, al completarse pasa al matchedUser.
    - theirBook era el libro que recibía el requester.
      Por lo tanto, al completarse pasa al requester.

    Esta función es idempotente:
    puedes ejecutarla muchas veces y siempre deja los dueños correctos.
  */
  await Promise.all([
    Book.findByIdAndUpdate(myBookId, {
      owner: matchedUserId,
      available: true
    }),
    Book.findByIdAndUpdate(theirBookId, {
      owner: requesterId,
      available: true
    })
  ]);

  return true;
}

async function repairCompletedExchangesForUser(userId) {
  const completed = await Exchange.find({
    participants: userId,
    status: 'completed'
  });

  let repaired = 0;
  for (const ex of completed) {
    const ok = await applyCompletedExchangeBookOwners(ex);
    if (ok) repaired++;
  }

  return repaired;
}

function populateExchange(q) {
  return q
    .populate('requester', 'username email location profilePhoto level completedExchanges ratingAvg ratingCount verificationStatus')
    .populate('matchedUser', 'username email location profilePhoto level completedExchanges ratingAvg ratingCount verificationStatus')
    .populate('participants', 'username email location profilePhoto level completedExchanges ratingAvg ratingCount verificationStatus')
    .populate('myBook', 'title author photos owner')
    .populate('theirBook', 'title author photos owner')
    .populate('confirmations.user', 'username profilePhoto');
}

router.get('/history', auth, async (req, res) => {
  try {
    // Repara intercambios antiguos que ya estaban completados antes de esta mejora.
    await repairCompletedExchangesForUser(req.userId);

    const items = await populateExchange(Exchange.find({
      participants: req.userId,
      status: 'completed'
    }))
      .sort({ completedAt: -1, updatedAt: -1 });

    res.json(items.map(x => {
      const obj = x.toJSON();
      obj.state = exchangeState(x, req.userId);
      return obj;
    }));
  } catch (err) {
    console.error('GET /api/exchanges/history error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/pending', auth, async (req, res) => {
  try {
    const items = await populateExchange(Exchange.find({
      participants: req.userId,
      status: 'pending'
    }))
      .sort({ updatedAt: -1 });

    res.json(items.map(x => {
      const obj = x.toJSON();
      obj.state = exchangeState(x, req.userId);
      return obj;
    }));
  } catch (err) {
    console.error('GET /api/exchanges/pending error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});


router.post('/repair-my-books', auth, async (req, res) => {
  try {
    const repaired = await repairCompletedExchangesForUser(req.userId);
    res.json({ ok: true, repaired });
  } catch (err) {
    console.error('POST /api/exchanges/repair-my-books error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/confirm', auth, async (req, res) => {
  try {
    const { matchedUserId, myBookId, theirBookId } = req.body;

    if (!matchedUserId || !myBookId || !theirBookId) {
      return res.status(400).json({ error: 'matchedUserId, myBookId y theirBookId son requeridos' });
    }

    const a = String(req.userId);
    const b = String(matchedUserId);
    const sortedUsers = [a, b].sort();
    const sortedBooks = [String(myBookId), String(theirBookId)].sort();
    const matchKey = `${sortedUsers[0]}_${sortedUsers[1]}_${sortedBooks[0]}_${sortedBooks[1]}`;

    let exchange = await Exchange.findOne({ matchKey });

    if (!exchange) {
      exchange = await Exchange.create({
        participants: sortedUsers,
        requester: req.userId,
        matchedUser: matchedUserId,
        myBook: myBookId,
        theirBook: theirBookId,
        matchKey,
        confirmations: [{ user: req.userId }]
      });

      await Notification.create({
        user: matchedUserId,
        type: 'exchange_confirmed',
        title: 'Confirmación de intercambio',
        body: 'El otro usuario confirmó que el intercambio se realizó. Confirma tú también para cerrarlo.',
        data: { exchangeId: exchange._id }
      });
    } else {
      if (!exchange.participants.map(String).includes(String(req.userId))) {
        return res.status(403).json({ error: 'No perteneces a este intercambio' });
      }

      if (!exchange.isConfirmedBy(req.userId)) {
        exchange.confirmations.push({ user: req.userId });
      }

      if (exchange.confirmations.length >= 2 && exchange.status !== 'completed') {
        exchange.status = 'completed';
        exchange.completedAt = new Date();


        // Transferir propiedad real de los libros.
        // myBook pasa al otro usuario; theirBook pasa al requester.
        await applyCompletedExchangeBookOwners(exchange);


        await User.updateMany(
          { _id: { $in: exchange.participants } },
          { $inc: { completedExchanges: 1 } }
        );

        for (const uid of exchange.participants) {
          await updateUserLevel(uid);
          await Notification.create({
            user: uid,
            type: 'exchange_completed',
            title: 'Intercambio completado',
            body: 'El intercambio quedó guardado en tu historial.',
            data: { exchangeId: exchange._id }
          });
        }
      } else {
        const otherUser = exchange.participants.map(String).find(x => x !== String(req.userId));
        if (otherUser) {
          await Notification.create({
            user: otherUser,
            type: 'exchange_confirmed',
            title: 'Confirmación de intercambio',
            body: 'El otro usuario confirmó el intercambio. Falta tu confirmación.',
            data: { exchangeId: exchange._id }
          });
        }
      }

      await exchange.save();
    }

    exchange = await populateExchange(Exchange.findById(exchange._id));
    const obj = exchange.toJSON();
    obj.state = exchangeState(exchange, req.userId);

    res.json({
      ok: true,
      completed: exchange.status === 'completed',
      exchange: obj
    });
  } catch (err) {
    console.error('POST /api/exchanges/confirm error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
