const express=require('express');
const auth=require('../middleware/auth');
const Notification=require('../models/Notification');

const router=express.Router();

router.get('/',auth,async(req,res)=>{
  try{
    const items=await Notification.find({user:req.userId}).sort({createdAt:-1}).limit(50);
    const unread=await Notification.countDocuments({user:req.userId,read:false});
    res.json({unread,items});
  }catch(e){
    res.status(500).json({error:'Error del servidor'});
  }
});

/*
  GET /api/notifications/message-unread
  Devuelve los mensajes no leídos agrupados por sala de chat.
  Esto hace que los numeritos rojos funcionen aunque el socket falle,
  aunque cambies de módulo o aunque el usuario no tenga el chat abierto.
*/
router.get('/message-unread',auth,async(req,res)=>{
  try{
    const items=await Notification.find({
      user:req.userId,
      read:false,
      type:'message'
    }).sort({createdAt:-1}).limit(300);

    const rooms={};

    for(const n of items){
      const roomId=n.data?.roomId;
      if(!roomId)continue;
      rooms[roomId]=(rooms[roomId]||0)+1;
    }

    const total=Object.values(rooms).reduce((a,b)=>a+b,0);

    res.json({ok:true,total,rooms});
  }catch(e){
    console.error('GET /api/notifications/message-unread error:',e);
    res.status(500).json({error:'Error del servidor'});
  }
});

/*
  PUT /api/notifications/read-room/:roomId
  Marca como leídos solo los mensajes de un chat específico.
*/
router.put('/read-room/:roomId',auth,async(req,res)=>{
  try{
    const roomId=req.params.roomId;

    await Notification.updateMany({
      user:req.userId,
      type:'message',
      read:false,
      'data.roomId':roomId
    },{read:true});

    res.json({ok:true});
  }catch(e){
    console.error('PUT /api/notifications/read-room error:',e);
    res.status(500).json({error:'Error del servidor'});
  }
});

router.put('/read',auth,async(req,res)=>{
  try{
    await Notification.updateMany({user:req.userId,read:false},{read:true});
    res.json({ok:true});
  }catch(e){
    res.status(500).json({error:'Error del servidor'});
  }
});

module.exports=router;
