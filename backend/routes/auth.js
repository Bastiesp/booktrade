const express=require('express');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const crypto=require('crypto');
const User=require('../models/User');
const router=express.Router();

function tokenFor(user){return jwt.sign({id:user._id},process.env.JWT_SECRET,{expiresIn:'7d'});}
function safeUser(u){return {id:u._id,_id:u._id,username:u.username,email:u.email,bio:u.bio,location:u.location,favoriteGenres:u.favoriteGenres,profilePhoto:u.profilePhoto,verificationStatus:u.verificationStatus,completedExchanges:u.completedExchanges,level:u.level,ratingAvg:u.ratingAvg,ratingCount:u.ratingCount,role:u.role};}

async function sendResetMail(email,url){
  if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS){
    console.log('🔐 LINK RECUPERACIÓN BOOKTRADE:',email,url);
    return;
  }
  const nodemailer=require('nodemailer');
  const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||'false')==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
  await transporter.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to:email,subject:'Restablecer contraseña — BookTrade',html:`<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5"><h2>Restablecer contraseña</h2><p>Haz clic para crear una nueva contraseña en BookTrade.</p><p><a href="${url}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Crear nueva contraseña</a></p><p>Este enlace vence en 1 hora.</p></div>`});
}

router.post('/register',async(req,res)=>{
  try{
    const {username,email,password}=req.body;
    if(!username||!email||!password)return res.status(400).json({error:'Todos los campos son requeridos'});
    if(password.length<6)return res.status(400).json({error:'La contraseña debe tener al menos 6 caracteres'});
    const existing=await User.findOne({$or:[{email:email.toLowerCase().trim()},{username:username.trim()}]});
    if(existing)return res.status(409).json({error:'Este usuario o correo ya está registrado'});
    const hashed=await bcrypt.hash(password,12);
    const user=await User.create({username:username.trim(),email:email.toLowerCase().trim(),password:hashed});
    res.status(201).json({token:tokenFor(user),user:safeUser(user)});
  }catch(err){console.error(err);if(err.name==='ValidationError')return res.status(400).json({error:Object.values(err.errors)[0].message});res.status(500).json({error:'Error del servidor'});}
});

router.post('/login',async(req,res)=>{
  try{
    const {identifier,password}=req.body;
    if(!identifier||!password)return res.status(400).json({error:'Ingresa tus credenciales'});
    const user=await User.findOne({$or:[{email:identifier.toLowerCase().trim()},{username:identifier.trim()}]}).select('+password');
    if(!user)return res.status(401).json({error:'Credenciales incorrectas'});
    const ok=await bcrypt.compare(password,user.password);
    if(!ok)return res.status(401).json({error:'Credenciales incorrectas'});
    res.json({token:tokenFor(user),user:safeUser(user)});
  }catch(err){console.error(err);res.status(500).json({error:'Error del servidor'});}
});

router.post('/forgot-password',async(req,res)=>{
  try{
    const email=String(req.body.email||'').toLowerCase().trim();
    if(!email)return res.status(400).json({error:'Ingresa tu correo'});
    const generic={ok:true,message:'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.'};
    const user=await User.findOne({email});
    if(!user)return res.json(generic);
    const raw=crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken=crypto.createHash('sha256').update(raw).digest('hex');
    user.resetPasswordExpires=new Date(Date.now()+60*60*1000);
    await user.save();
    const base=process.env.APP_URL||(`${req.protocol}://${req.get('host')}`);
    await sendResetMail(user.email,`${base}/reset-password.html?token=${raw}`);
    res.json(generic);
  }catch(err){console.error(err);res.status(500).json({error:'Error del servidor'});}
});

router.post('/reset-password',async(req,res)=>{
  try{
    const {token,password}=req.body;
    if(!token||!password)return res.status(400).json({error:'Token y contraseña son requeridos'});
    if(password.length<6)return res.status(400).json({error:'La contraseña debe tener al menos 6 caracteres'});
    const hash=crypto.createHash('sha256').update(String(token)).digest('hex');
    const user=await User.findOne({resetPasswordToken:hash,resetPasswordExpires:{$gt:new Date()}}).select('+password');
    if(!user)return res.status(400).json({error:'El enlace es inválido o expiró'});
    user.password=await bcrypt.hash(password,12);
    user.resetPasswordToken='';user.resetPasswordExpires=null;
    await user.save();
    res.json({ok:true,message:'Contraseña actualizada correctamente'});
  }catch(err){console.error(err);res.status(500).json({error:'Error del servidor'});}
});

module.exports=router;
