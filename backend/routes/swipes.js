const express=require('express');
const auth=require('../middleware/auth');
const Swipe=require('../models/Swipe');
const Book=require('../models/Book');
const User=require('../models/User');
const Notification=require('../models/Notification');
const Exchange=require('../models/Exchange');

const router=express.Router();

function makeMatchKey(userA,userB,bookA,bookB){
  const users=[String(userA),String(userB)].sort();
  const books=[String(bookA),String(bookB)].sort();
  return `${users[0]}_${users[1]}_${books[0]}_${books[1]}`;
}

function stateFromExchange(exchange,userId){
  if(!exchange){
    return {
      label:'Coordinando',
      code:'coordinating',
      mineConfirmed:false,
      otherConfirmed:false
    };
  }

  const confirmations=exchange.confirmations||[];
  const mine=confirmations.some(c=>String(c.user?._id||c.user)===String(userId));
  const other=confirmations.some(c=>String(c.user?._id||c.user)!==String(userId));

  if(exchange.status==='completed'){
    return {
      label:'Intercambio hecho',
      code:'exchange_done',
      mineConfirmed:true,
      otherConfirmed:true
    };
  }

  if(mine&&other){
    return {
      label:'Listo para completar',
      code:'ready',
      mineConfirmed:true,
      otherConfirmed:true
    };
  }

  if(mine&&!other){
    return {
      label:'Esperando confirmación de la otra persona',
      code:'waiting_other',
      mineConfirmed:true,
      otherConfirmed:false
    };
  }

  if(!mine&&other){
    return {
      label:'Falta tu confirmación',
      code:'waiting_me',
      mineConfirmed:false,
      otherConfirmed:true
    };
  }

  return {
    label:'Coordinando',
    code:'coordinating',
    mineConfirmed:false,
    otherConfirmed:false
  };
}

async function getExchangeForMatch(userA,userB,bookA,bookB){
  return Exchange.findOne({matchKey:makeMatchKey(userA,userB,bookA,bookB)});
}

/*
  Regla de match entre dos usuarios:
  - Un libro X del usuario 1 puede tener solo un match activo con un libro del usuario 2.
  - Un libro Y del usuario 2 puede tener solo un match activo con un libro del usuario 1.
  - Ese mismo libro sí puede matchear con libros de otros usuarios.
  - La regla se aplica por par de usuarios.
*/
function pairBookLockKey(otherUserId,bookId){
  return `${String(otherUserId)}:${String(bookId)}`;
}

router.post('/',auth,async(req,res)=>{
  try{
    const{bookId,direction}=req.body;

    if(!bookId||!['right','left'].includes(direction)){
      return res.status(400).json({error:'bookId y direction requeridos'});
    }

    const book=await Book.findById(bookId).populate('owner','username email location profilePhoto level completedExchanges');
    if(!book)return res.status(404).json({error:'Libro no encontrado'});
    if(book.owner._id.toString()===req.userId)return res.status(400).json({error:'No puedes deslizar tus propios libros'});

    try{
      await Swipe.create({swiper:req.userId,book:bookId,direction});
    }catch(e){
      if(e.code!==11000)throw e;
    }

    let match=null;

    if(direction==='right'){
      const ownerId=String(book.owner._id);
      const myBooks=await Book.find({owner:req.userId}).select('_id title author photos');

      // Buscar todos los swipes del otro usuario sobre mis libros.
      const theirSwipes=await Swipe.find({
        swiper:book.owner._id,
        book:{$in:myBooks.map(b=>b._id)},
        direction:'right'
      }).populate('book','title author photos');

      // Evitar que el libro que acabo de elegir quede emparejado con más de un libro
      // de este mismo usuario, y viceversa.
      const existingMyRight=await Swipe.find({
        swiper:req.userId,
        direction:'right'
      }).populate({
        path:'book',
        populate:{path:'owner',select:'username'}
      });

      const usedByPair=new Set();

      for(const sw of existingMyRight){
        if(!sw.book?.owner)continue;
        if(String(sw.book.owner._id)!==ownerId)continue;

        const otherSwipes=await Swipe.find({
          swiper:book.owner._id,
          book:{$in:myBooks.map(b=>b._id)},
          direction:'right'
        }).populate('book','title author photos');

        for(const os of otherSwipes){
          if(!os.book)continue;
          const k=makeMatchKey(req.userId,ownerId,sw.book._id,os.book._id);
          const ex=await Exchange.findOne({matchKey:k});
          // Si ya existe intercambio completado o pendiente, bloquear esa combinación.
          // Si no existe Exchange, igual representa un match derivado por swipes.
          usedByPair.add(pairBookLockKey(ownerId,sw.book._id));
          usedByPair.add(pairBookLockKey(ownerId,os.book._id));
          if(ex?.status==='completed')continue;
        }
      }

      for(const theirSwipe of theirSwipes){
        if(!theirSwipe?.book)continue;

        const myBookId=String(theirSwipe.book._id);
        const theirBookId=String(book._id);

        // Si el libro externo ya está usando un match con este mismo usuario,
        // o mi libro ya está usando un match con este mismo usuario, no abrir otro.
        // Permitimos la misma combinación exacta.
        const exactCurrentKey=makeMatchKey(req.userId,ownerId,theirBookId,myBookId);
        const alreadySameExact=await Exchange.findOne({matchKey:exactCurrentKey});

        const theirBookLocked=usedByPair.has(pairBookLockKey(ownerId,theirBookId));
        const myBookLocked=usedByPair.has(pairBookLockKey(ownerId,myBookId));

        if((theirBookLocked||myBookLocked)&&!alreadySameExact){
          continue;
        }

        const me=await User.findById(req.userId).select('username email');

        const exchange=await getExchangeForMatch(req.userId,ownerId,theirBookId,myBookId);

        match={
          id:`${req.userId}_${ownerId}_${theirBookId}_${myBookId}`,
          matchedUser:{
            id:book.owner._id,
            username:book.owner.username,
            email:book.owner.email,
            location:book.owner.location,
            profilePhoto:book.owner.profilePhoto,
            level:book.owner.level,
            completedExchanges:book.owner.completedExchanges
          },
          theirBook:{id:book._id,title:book.title,author:book.author,photos:book.photos||[]},
          myBook:{id:theirSwipe.book._id,title:theirSwipe.book.title,author:theirSwipe.book.author,photos:theirSwipe.book.photos||[]},
          exchangeState:stateFromExchange(exchange,req.userId)
        };

        await Notification.create({
          user:book.owner._id,
          type:'match',
          title:'Nuevo match',
          body:`${me?.username||'Un usuario'} quiere intercambiar contigo.`,
          data:{matchedUser:req.userId,bookId:book._id,myBookId:theirSwipe.book._id}
        });

        await Notification.create({
          user:req.userId,
          type:'match',
          title:'Nuevo match',
          body:`Tienes un match con @${book.owner.username}.`,
          data:{matchedUser:book.owner._id,bookId:book._id,myBookId:theirSwipe.book._id}
        });

        break;
      }
    }

    res.json({swiped:true,match});
  }catch(err){
    console.error(err);
    res.status(500).json({error:'Error del servidor'});
  }
});

router.get('/matches',auth,async(req,res)=>{
  try{
    const myRight=await Swipe.find({swiper:req.userId,direction:'right'})
      .populate({
        path:'book',
        populate:{path:'owner',select:'username email location profilePhoto level completedExchanges'}
      });

    const myBooks=await Book.find({owner:req.userId}).select('_id title author photos');
    const myBookIds=myBooks.map(b=>b._id);

    const matches=[];
    const seenExact=new Set();

    // Regla por par de usuarios:
    // Para cada usuario con el que tengo matches, un libro mío y un libro del otro
    // solo pueden aparecer una vez entre nosotros mientras el intercambio no se cierre.
    const lockedByPair=new Set();

    for(const swipe of myRight){
      if(!swipe.book?.owner)continue;

      const ownerId=String(swipe.book.owner._id);
      const theirBookId=String(swipe.book._id);

      const theirSwipes=await Swipe.find({
        swiper:swipe.book.owner._id,
        book:{$in:myBookIds},
        direction:'right'
      }).populate('book','title author photos');

      for(const theirSwipe of theirSwipes){
        if(!theirSwipe?.book)continue;

        const myBookId=String(theirSwipe.book._id);
        const exactKey=`${ownerId}_${[theirBookId,myBookId].sort().join('_')}`;

        if(seenExact.has(exactKey))continue;

        const exchange=await getExchangeForMatch(req.userId,ownerId,theirBookId,myBookId);
        const state=stateFromExchange(exchange,req.userId);

        const lockTheir=pairBookLockKey(ownerId,theirBookId);
        const lockMine=pairBookLockKey(ownerId,myBookId);

        // Si uno de estos libros ya quedó vinculado con el mismo usuario en otro match,
        // no mostrar otro match duplicado entre estos dos usuarios.
        // Excepción: el intercambio ya está completado; igual lo dejamos visible con estado hecho.
        if(state.code!=='exchange_done'&&(lockedByPair.has(lockTheir)||lockedByPair.has(lockMine))){
          continue;
        }

        seenExact.add(exactKey);
        lockedByPair.add(lockTheir);
        lockedByPair.add(lockMine);

        matches.push({
          id:`${req.userId}_${ownerId}_${theirBookId}_${myBookId}`,
          matchedUser:{
            id:swipe.book.owner._id,
            username:swipe.book.owner.username,
            email:swipe.book.owner.email,
            location:swipe.book.owner.location,
            profilePhoto:swipe.book.owner.profilePhoto,
            level:swipe.book.owner.level,
            completedExchanges:swipe.book.owner.completedExchanges
          },
          theirBook:{id:swipe.book._id,title:swipe.book.title,author:swipe.book.author,photos:swipe.book.photos||[]},
          myBook:{id:theirSwipe.book._id,title:theirSwipe.book.title,author:theirSwipe.book.author,photos:theirSwipe.book.photos||[]},
          createdAt:theirSwipe.createdAt,
          exchangeState:state
        });
      }
    }

    matches.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    res.json(matches);
  }catch(e){
    console.error(e);
    res.status(500).json({error:'Error del servidor'});
  }
});

module.exports=router;
