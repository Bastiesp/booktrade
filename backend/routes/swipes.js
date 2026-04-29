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
    return {label:'Coordinando',code:'coordinating',mineConfirmed:false,otherConfirmed:false};
  }

  const confirmations=exchange.confirmations||[];
  const mine=confirmations.some(c=>String(c.user?._id||c.user)===String(userId));
  const other=confirmations.some(c=>String(c.user?._id||c.user)!==String(userId));

  if(exchange.status==='completed'){
    return {label:'Intercambio hecho',code:'exchange_done',mineConfirmed:true,otherConfirmed:true};
  }
  if(mine&&other){
    return {label:'Listo para completar',code:'ready',mineConfirmed:true,otherConfirmed:true};
  }
  if(mine&&!other){
    return {label:'Esperando confirmación de la otra persona',code:'waiting_other',mineConfirmed:true,otherConfirmed:false};
  }
  if(!mine&&other){
    return {label:'Falta tu confirmación',code:'waiting_me',mineConfirmed:false,otherConfirmed:true};
  }

  return {label:'Coordinando',code:'coordinating',mineConfirmed:false,otherConfirmed:false};
}

function bookSummary(book){
  return {
    id:book?._id,
    title:book?.title,
    author:book?.author,
    photos:book?.photos||[]
  };
}

function userSummary(user){
  return {
    id:user?._id,
    username:user?.username,
    email:user?.email,
    location:user?.location,
    profilePhoto:user?.profilePhoto,
    level:user?.level,
    completedExchanges:user?.completedExchanges
  };
}

router.post('/',auth,async(req,res)=>{
  try{
    const{bookId,direction}=req.body;

    if(!bookId||!['right','left'].includes(direction)){
      return res.status(400).json({error:'bookId y direction requeridos'});
    }

    const book=await Book.findById(bookId)
      .select('_id owner title author photos')
      .populate('owner','username email location profilePhoto level completedExchanges');

    if(!book)return res.status(404).json({error:'Libro no encontrado'});
    if(String(book.owner._id)===String(req.userId)){
      return res.status(400).json({error:'No puedes deslizar tus propios libros'});
    }

    try{
      await Swipe.create({swiper:req.userId,book:bookId,direction});
    }catch(e){
      if(e.code!==11000)throw e;
    }

    let match=null;

    if(direction==='right'){
      const ownerId=String(book.owner._id);

      // Libros míos en una sola consulta.
      const myBooks=await Book.find({owner:req.userId})
        .select('_id title author photos')
        .lean();

      const myBookIds=myBooks.map(b=>b._id);
      const myBookMap=new Map(myBooks.map(b=>[String(b._id),b]));

      // ¿El dueño del libro hizo right en alguno de mis libros?
      const theirSwipe=await Swipe.findOne({
        swiper:book.owner._id,
        book:{$in:myBookIds},
        direction:'right'
      }).sort({createdAt:-1}).lean();

      if(theirSwipe){
        const myBook=myBookMap.get(String(theirSwipe.book));
        const exchange=await Exchange.findOne({
          matchKey:makeMatchKey(req.userId,ownerId,book._id,theirSwipe.book)
        }).lean();

        match={
          id:`${req.userId}_${ownerId}_${book._id}_${theirSwipe.book}`,
          matchedUser:userSummary(book.owner),
          theirBook:bookSummary(book),
          myBook:bookSummary(myBook),
          exchangeState:stateFromExchange(exchange,req.userId)
        };

        const me=await User.findById(req.userId).select('username').lean();

        // Las notificaciones no deben romper el swipe si fallan.
        Notification.create([
          {
            user:book.owner._id,
            type:'match',
            title:'Nuevo match',
            body:`${me?.username||'Un usuario'} quiere intercambiar contigo.`,
            data:{matchedUser:req.userId,bookId:book._id,myBookId:theirSwipe.book}
          },
          {
            user:req.userId,
            type:'match',
            title:'Nuevo match',
            body:`Tienes un match con @${book.owner.username}.`,
            data:{matchedUser:book.owner._id,bookId:book._id,myBookId:theirSwipe.book}
          }
        ]).catch(()=>{});
      }
    }

    res.json({swiped:true,match});
  }catch(err){
    console.error('POST /api/swipes error:',err);
    res.status(500).json({error:'Error del servidor'});
  }
});

router.get('/matches',auth,async(req,res)=>{
  try{
    // 1) Mis libros
    const myBooks=await Book.find({owner:req.userId})
      .select('_id title author photos')
      .lean();

    const myBookIds=myBooks.map(b=>b._id);
    const myBookMap=new Map(myBooks.map(b=>[String(b._id),b]));

    if(!myBookIds.length){
      return res.json([]);
    }

    // 2) Mis right swipes sobre libros de otros
    const myRight=await Swipe.find({swiper:req.userId,direction:'right'})
      .populate({
        path:'book',
        select:'_id title author photos owner',
        populate:{path:'owner',select:'username email location profilePhoto level completedExchanges'}
      })
      .sort({createdAt:-1})
      .limit(500)
      .lean();

    const ownerIds=[...new Set(
      myRight
        .map(s=>s.book?.owner?._id)
        .filter(Boolean)
        .map(String)
    )];

    if(!ownerIds.length){
      return res.json([]);
    }

    // 3) Swipes de esos usuarios sobre mis libros, una consulta.
    const theirRight=await Swipe.find({
      swiper:{$in:ownerIds},
      book:{$in:myBookIds},
      direction:'right'
    })
      .sort({createdAt:-1})
      .limit(1000)
      .lean();

    const theirByOwner=new Map();
    for(const s of theirRight){
      const k=String(s.swiper);
      if(!theirByOwner.has(k))theirByOwner.set(k,[]);
      theirByOwner.get(k).push(s);
    }

    // 4) Traer exchanges relacionados una vez.
    const possibleKeys=[];
    for(const swipe of myRight){
      if(!swipe.book?.owner)continue;
      const ownerId=String(swipe.book.owner._id);
      const theirSwipes=theirByOwner.get(ownerId)||[];
      for(const ts of theirSwipes){
        possibleKeys.push(makeMatchKey(req.userId,ownerId,swipe.book._id,ts.book));
      }
    }

    const exchanges=possibleKeys.length
      ? await Exchange.find({matchKey:{$in:possibleKeys}}).lean()
      : [];

    const exchangeMap=new Map(exchanges.map(e=>[e.matchKey,e]));

    const matches=[];
    const seenExact=new Set();
    const lockedByPair=new Set();

    for(const swipe of myRight){
      if(!swipe.book?.owner)continue;

      const ownerId=String(swipe.book.owner._id);
      const theirBookId=String(swipe.book._id);
      const theirSwipes=theirByOwner.get(ownerId)||[];

      for(const theirSwipe of theirSwipes){
        const myBookId=String(theirSwipe.book);
        const exactKey=`${ownerId}_${[theirBookId,myBookId].sort().join('_')}`;

        if(seenExact.has(exactKey))continue;

        const matchKey=makeMatchKey(req.userId,ownerId,theirBookId,myBookId);
        const exchange=exchangeMap.get(matchKey);
        const state=stateFromExchange(exchange,req.userId);

        const lockTheir=`${ownerId}:${theirBookId}`;
        const lockMine=`${ownerId}:${myBookId}`;

        // Mantener regla: entre dos usuarios, un libro no genera múltiples matches simultáneos.
        if(state.code!=='exchange_done'&&(lockedByPair.has(lockTheir)||lockedByPair.has(lockMine))){
          continue;
        }

        seenExact.add(exactKey);
        lockedByPair.add(lockTheir);
        lockedByPair.add(lockMine);

        matches.push({
          id:`${req.userId}_${ownerId}_${theirBookId}_${myBookId}`,
          matchedUser:userSummary(swipe.book.owner),
          theirBook:bookSummary(swipe.book),
          myBook:bookSummary(myBookMap.get(myBookId)),
          createdAt:theirSwipe.createdAt,
          exchangeState:state
        });
      }
    }

    matches.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    res.json(matches);
  }catch(e){
    console.error('GET /api/swipes/matches error:',e);
    res.status(500).json({error:'Error del servidor'});
  }
});

module.exports=router;
