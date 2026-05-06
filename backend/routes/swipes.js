const express=require('express');
const auth=require('../middleware/auth');
const Swipe=require('../models/Swipe');
const Book=require('../models/Book');
const User=require('../models/User');
const Notification=require('../models/Notification');
const Exchange=require('../models/Exchange');

const router=express.Router();

const USER_PUBLIC_FIELDS='username email location profilePhoto level completedExchanges verified isVerified profileVerified photoApproved profilePhotoApproved facePhotoApproved avatarApproved verificationStatus verifiedStatus profilePhotoStatus photoStatus status';

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
    completedExchanges:user?.completedExchanges,
    verified:user?.verified,
    isVerified:user?.isVerified,
    profileVerified:user?.profileVerified,
    photoApproved:user?.photoApproved,
    profilePhotoApproved:user?.profilePhotoApproved,
    facePhotoApproved:user?.facePhotoApproved,
    avatarApproved:user?.avatarApproved,
    verificationStatus:user?.verificationStatus,
    verifiedStatus:user?.verifiedStatus,
    profilePhotoStatus:user?.profilePhotoStatus,
    photoStatus:user?.photoStatus,
    status:user?.status
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
      .populate('owner',USER_PUBLIC_FIELDS);

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

      if(theirSwipe && String(theirSwipe.book)!==String(book._id)){
        const myBook=myBookMap.get(String(theirSwipe.book));
        if(!myBook){
          return res.json({swiped:true,match:null});
        }

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
    const matches=[];
    const seen=new Set();
    const currentUserId=String(req.userId);

    const addMatch=(m)=>{
      if(!m?.matchedUser?.id||!m?.myBook?.id||!m?.theirBook?.id)return;
      if(String(m.myBook.id)===String(m.theirBook.id))return;
      const key=String(m.id||makeMatchKey(currentUserId,m.matchedUser.id,m.myBook.id,m.theirBook.id));
      if(seen.has(key))return;
      seen.add(key);
      matches.push({...m,id:key});
    };

    // 1) Intercambios ya creados: orientarlos siempre desde el usuario actual.
    // Esto evita que, después de cambiar dueños de libros, aparezca mi foto
    // o el mismo libro en "Tú das" y "Recibes".
    const exchanges=await Exchange.find({participants:req.userId})
      .populate('requester',USER_PUBLIC_FIELDS)
      .populate('matchedUser',USER_PUBLIC_FIELDS)
      .populate('myBook','title author photos')
      .populate('theirBook','title author photos')
      .sort({updatedAt:-1})
      .lean();

    for(const ex of exchanges){
      const requesterId=String(ex.requester?._id||ex.requester);
      const amRequester=requesterId===currentUserId;
      const other=amRequester?ex.matchedUser:ex.requester;
      const myBook=amRequester?ex.myBook:ex.theirBook;
      const theirBook=amRequester?ex.theirBook:ex.myBook;

      addMatch({
        id:makeMatchKey(currentUserId,other?._id,myBook?._id,theirBook?._id),
        matchedUser:userSummary(other),
        myBook:bookSummary(myBook),
        theirBook:bookSummary(theirBook),
        createdAt:ex.createdAt||ex.updatedAt,
        exchangeState:stateFromExchange(ex,req.userId)
      });
    }

    // 2) Matches por swipes recíprocos que aún no tienen intercambio creado.
    const myBooks=await Book.find({owner:req.userId})
      .select('_id title author photos')
      .lean();

    const myBookIds=myBooks.map(b=>b._id);
    const myBookMap=new Map(myBooks.map(b=>[String(b._id),b]));

    if(myBookIds.length){
      const myRight=await Swipe.find({swiper:req.userId,direction:'right'})
        .populate({
          path:'book',
          select:'_id title author photos owner',
          populate:{path:'owner',select:USER_PUBLIC_FIELDS}
        })
        .sort({createdAt:-1})
        .limit(500)
        .lean();

      const validMyRight=myRight.filter(s=>
        s.book?.owner?._id &&
        String(s.book.owner._id)!==currentUserId
      );

      const ownerIds=[...new Set(validMyRight.map(s=>String(s.book.owner._id)))];

      if(ownerIds.length){
        const theirRight=await Swipe.find({
          swiper:{$in:ownerIds},
          book:{$in:myBookIds},
          direction:'right'
        }).sort({createdAt:-1}).limit(1000).lean();

        const theirByOwner=new Map();
        for(const s of theirRight){
          const k=String(s.swiper);
          if(!theirByOwner.has(k))theirByOwner.set(k,[]);
          theirByOwner.get(k).push(s);
        }

        for(const swipe of validMyRight){
          const ownerId=String(swipe.book.owner._id);
          const theirBookId=String(swipe.book._id);
          const candidates=theirByOwner.get(ownerId)||[];

          for(const ts of candidates){
            const myBookId=String(ts.book);
            if(myBookId===theirBookId)continue;

            const myBook=myBookMap.get(myBookId);
            if(!myBook)continue;

            addMatch({
              id:makeMatchKey(currentUserId,ownerId,myBookId,theirBookId),
              matchedUser:userSummary(swipe.book.owner),
              myBook:bookSummary(myBook),
              theirBook:bookSummary(swipe.book),
              createdAt:ts.createdAt,
              exchangeState:stateFromExchange(null,req.userId)
            });

            break;
          }
        }
      }
    }

    matches.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    res.json(matches);
  }catch(e){
    console.error('GET /api/swipes/matches error:',e);
    res.status(500).json({error:'Error del servidor'});
  }
});

module.exports=router;