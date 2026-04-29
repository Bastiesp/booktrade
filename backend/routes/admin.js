const express=require('express');
const auth=require('../middleware/auth');
const User=require('../models/User');
const Book=require('../models/Book');
const Exchange=require('../models/Exchange');
const Message=require('../models/Message');
const Report=require('../models/Report');
const AdminAction=require('../models/AdminAction');

const router=express.Router();

function adminEmails(){
  return String(process.env.ADMIN_EMAILS||process.env.ADMIN_EMAIL||'')
    .split(',')
    .map(x=>x.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(req,res,next){
  try{
    const u=await User.findById(req.userId);
    if(!u)return res.status(401).json({error:'Usuario no encontrado'});
    if(!(u.role==='admin'||adminEmails().includes(String(u.email).toLowerCase()))){
      return res.status(403).json({error:'Acceso solo para administrador'});
    }
    req.adminUser=u;
    next();
  }catch(e){
    console.error('requireAdmin error:',e);
    res.status(500).json({error:'Error validando administrador'});
  }
}

async function log(req,action,targetType,targetId,detail={}){
  try{
    await AdminAction.create({admin:req.adminUser?._id||req.userId,action,targetType,targetId:String(targetId||''),detail});
  }catch{}
}

router.get('/whoami',auth,async(req,res)=>{
  try{
    const u=await User.findById(req.userId).select('-password');
    const isAdmin=!!u&&(u.role==='admin'||adminEmails().includes(String(u.email).toLowerCase()));
    res.json({ok:true,isAdmin,user:u?{id:u._id,username:u.username,email:u.email,role:u.role,accountStatus:u.accountStatus}:null});
  }catch(e){
    res.status(500).json({error:'Error del servidor'});
  }
});

router.get('/summary',auth,requireAdmin,async(req,res)=>{
  try{
    const start=new Date(new Date().getFullYear(),new Date().getMonth(),1);
    const vals=await Promise.all([
      User.countDocuments({accountStatus:{$ne:'deleted'}}),
      User.countDocuments({role:'admin'}),
      User.countDocuments({accountStatus:'blocked'}),
      User.countDocuments({accountStatus:'deleted'}),
      Book.countDocuments(),
      Book.countDocuments({available:true}),
      Exchange.countDocuments({status:'completed'}),
      Exchange.countDocuments({status:'pending'}),
      Message.countDocuments(),
      Report.countDocuments({status:'open'}),
      User.countDocuments({profilePhoto:{$ne:''},verificationStatus:'pending',accountStatus:{$ne:'deleted'}}),
      User.countDocuments({createdAt:{$gte:start},accountStatus:{$ne:'deleted'}})
    ]);
    res.json({users:vals[0],admins:vals[1],blocked:vals[2],deleted:vals[3],books:vals[4],activeBooks:vals[5],completed:vals[6],pending:vals[7],messages:vals[8],reportsOpen:vals[9],pendingVerifications:vals[10],newUsersMonth:vals[11]});
  }catch(e){
    console.error('GET /api/admin/summary error:',e);
    res.status(500).json({error:'Error cargando KPIs'});
  }
});

router.get('/users',auth,requireAdmin,async(req,res)=>{
  try{
    const q=String(req.query.q||'').trim();
    const includeDeleted=String(req.query.includeDeleted||'')==='true';
    const baseFilter=includeDeleted?{}:{accountStatus:{$ne:'deleted'}};
    const searchFilter=q?{$or:[{username:new RegExp(q,'i')},{email:new RegExp(q,'i')},{location:new RegExp(q,'i')}]}:{};
    const filter=q?{$and:[baseFilter,searchFilter]}:baseFilter;
    const users=await User.find(filter).select('-password -resetPasswordToken -resetPasswordExpires').sort({createdAt:-1}).limit(500).lean();
    const ids=users.map(u=>u._id);
    const counts=await Book.aggregate([{$match:{owner:{$in:ids}}},{$group:{_id:'$owner',total:{$sum:1},active:{$sum:{$cond:['$available',1,0]}}}}]);
    const m={}; counts.forEach(x=>m[String(x._id)]=x);
    res.json(users.map(u=>({...u,totalBooks:m[String(u._id)]?.total||0,activeBooks:m[String(u._id)]?.active||0})));
  }catch(e){
    console.error('GET /api/admin/users error:',e);
    res.status(500).json({error:'Error cargando usuarios'});
  }
});

router.get('/books',auth,requireAdmin,async(req,res)=>{
  try{
    const q=String(req.query.q||'').trim();
    const filter=q?{$or:[{title:new RegExp(q,'i')},{author:new RegExp(q,'i')},{genre:new RegExp(q,'i')}]}:{};
    res.json(await Book.find(filter).populate('owner','username email location role accountStatus profilePhoto level completedExchanges verificationStatus').sort({createdAt:-1}).limit(500).lean());
  }catch(e){
    res.status(500).json({error:'Error cargando libros'});
  }
});

router.get('/exchanges',auth,requireAdmin,async(req,res)=>{
  try{
    const status=req.query.status;
    const filter=status&&status!=='all'?{status}:{};
    res.json(await Exchange.find(filter).populate('participants','username email location role accountStatus').populate('requester','username email').populate('matchedUser','username email').populate('myBook','title author').populate('theirBook','title author').sort({updatedAt:-1}).limit(500).lean());
  }catch(e){
    res.status(500).json({error:'Error cargando intercambios'});
  }
});

router.get('/reports',auth,requireAdmin,async(req,res)=>{
  try{
    res.json(await Report.find().populate('reporter','username email').populate('reportedUser','username email accountStatus').populate('book','title author').sort({createdAt:-1}).limit(300).lean());
  }catch(e){
    res.status(500).json({error:'Error cargando reportes'});
  }
});

router.put('/reports/:id',auth,requireAdmin,async(req,res)=>{
  try{
    const r=await Report.findByIdAndUpdate(req.params.id,{status:req.body.status,adminNote:req.body.adminNote},{new:true});
    await log(req,'update_report','report',req.params.id,req.body);
    res.json(r);
  }catch(e){
    res.status(500).json({error:'Error actualizando reporte'});
  }
});

router.get('/actions',auth,requireAdmin,async(req,res)=>{
  try{
    res.json(await AdminAction.find().populate('admin','username email').sort({createdAt:-1}).limit(300).lean());
  }catch(e){
    res.status(500).json({error:'Error cargando acciones'});
  }
});

router.get('/verifications',auth,requireAdmin,async(req,res)=>{
  try{
    res.json(await User.find({profilePhoto:{$ne:''},verificationStatus:'pending',accountStatus:{$ne:'deleted'}}).select('-password').sort({updatedAt:-1}).limit(200).lean());
  }catch(e){
    res.status(500).json({error:'Error cargando verificaciones'});
  }
});

router.put('/users/:id/verification',auth,requireAdmin,async(req,res)=>{
  const u=await User.findByIdAndUpdate(req.params.id,{verificationStatus:req.body.status},{new:true}).select('-password');
  await log(req,'verify_user','user',req.params.id,req.body);
  res.json(u);
});

router.put('/users/:id/role',auth,requireAdmin,async(req,res)=>{
  const u=await User.findByIdAndUpdate(req.params.id,{role:req.body.role},{new:true}).select('-password');
  await log(req,'change_role','user',req.params.id,req.body);
  res.json(u);
});

router.put('/users/:id/status',auth,requireAdmin,async(req,res)=>{
  const u=await User.findByIdAndUpdate(req.params.id,{accountStatus:req.body.status},{new:true}).select('-password');
  await log(req,req.body.status==='blocked'?'block_user':'activate_user','user',req.params.id,req.body);
  res.json(u);
});

router.delete('/users/:id',auth,requireAdmin,async(req,res)=>{
  try{
    const targetId=String(req.params.id);
    if(targetId===String(req.userId))return res.status(400).json({error:'No puedes eliminar tu propia cuenta administradora desde el panel'});
    const u=await User.findById(targetId);
    if(!u)return res.status(404).json({error:'Usuario no encontrado'});
    u.accountStatus='deleted';
    u.deletedAt=new Date();
    u.email=`deleted_${u._id}@booktrade.local`;
    u.username=`deleted_${String(u._id).slice(-8)}`;
    u.profilePhoto='';
    u.bio='';
    u.location='';
    await u.save();
    await Book.updateMany({owner:u._id},{available:false});
    await log(req,'delete_user','user',targetId,{soft:true,hideFromPanel:true});
    res.json({ok:true,deleted:true,userId:targetId});
  }catch(e){
    console.error('DELETE /api/admin/users/:id error:',e);
    res.status(500).json({error:'No se pudo eliminar el usuario'});
  }
});

router.delete('/books/:id',auth,requireAdmin,async(req,res)=>{
  await Book.findByIdAndDelete(req.params.id);
  await log(req,'delete_book','book',req.params.id,{});
  res.json({ok:true});
});

module.exports=router;
