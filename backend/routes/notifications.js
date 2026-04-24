const express=require('express');const auth=require('../middleware/auth');const Notification=require('../models/Notification');const router=express.Router();
router.get('/',auth,async(req,res)=>{try{const items=await Notification.find({user:req.userId}).sort({createdAt:-1}).limit(50);const unread=await Notification.countDocuments({user:req.userId,read:false});res.json({unread,items})}catch(e){res.status(500).json({error:'Error del servidor'})}});
router.put('/read',auth,async(req,res)=>{try{await Notification.updateMany({user:req.userId,read:false},{read:true});res.json({ok:true})}catch(e){res.status(500).json({error:'Error del servidor'})}});
module.exports=router;
