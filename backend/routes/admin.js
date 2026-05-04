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
    const r=await Report.findByIdAndUpdate(req.params.id,{status:req.body.status,adminNote:req.body.adminNote,priority:req.body.priority},{new:true});
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


// Dashboard visual avanzado
router.get('/dashboard',auth,requireAdmin,async(req,res)=>{
  try{
    const now=new Date();
    const dayAgo=new Date(now.getTime()-24*60*60*1000);
    const weekAgo=new Date(now.getTime()-7*24*60*60*1000);
    const monthAgo=new Date(now.getTime()-30*24*60*60*1000);

    const [
      users, usersWeek, usersMonth, admins, blocked, deleted,
      books, activeBooks, booksWeek,
      exchangesCompleted, exchangesPending, exchangesWeek,
      reportsOpen, reportsReviewing, reportsWaiting, reportsCritical,
      pendingVerifications, messages, messagesDay, actions
    ] = await Promise.all([
      User.countDocuments({accountStatus:{$ne:'deleted'}}),
      User.countDocuments({createdAt:{$gte:weekAgo},accountStatus:{$ne:'deleted'}}),
      User.countDocuments({createdAt:{$gte:monthAgo},accountStatus:{$ne:'deleted'}}),
      User.countDocuments({role:'admin'}),
      User.countDocuments({accountStatus:'blocked'}),
      User.countDocuments({accountStatus:'deleted'}),
      Book.countDocuments(),
      Book.countDocuments({available:true}),
      Book.countDocuments({createdAt:{$gte:weekAgo}}),
      Exchange.countDocuments({status:'completed'}),
      Exchange.countDocuments({status:'pending'}),
      Exchange.countDocuments({updatedAt:{$gte:weekAgo}}),
      Report.countDocuments({status:'open'}),
      Report.countDocuments({status:'reviewing'}),
      Report.countDocuments({status:'waiting_user'}),
      Report.countDocuments({priority:{$in:['high','critical']},status:{$in:['open','reviewing','waiting_user']}}),
      User.countDocuments({profilePhoto:{$ne:''},verificationStatus:'pending',accountStatus:{$ne:'deleted'}}),
      Message.countDocuments(),
      Message.countDocuments({createdAt:{$gte:dayAgo}}),
      AdminAction.find().populate('admin','username email').sort({createdAt:-1}).limit(12).lean()
    ]);

    const topUsers=await User.find({accountStatus:{$ne:'deleted'}})
      .select('username email location profilePhoto completedExchanges level ratingAvg ratingCount accountStatus verificationStatus createdAt')
      .sort({completedExchanges:-1,createdAt:-1})
      .limit(8)
      .lean();

    const topGenres=await Book.aggregate([
      {$group:{_id:'$genre',count:{$sum:1}}},
      {$sort:{count:-1}},
      {$limit:8}
    ]);

    const comunas=await User.aggregate([
      {$match:{accountStatus:{$ne:'deleted'},location:{$nin:[null,'']}}},
      {$group:{_id:'$location',count:{$sum:1}}},
      {$sort:{count:-1}},
      {$limit:8}
    ]);

    const recentReports=await Report.find({status:{$in:['open','reviewing','waiting_user']}})
      .populate('reporter','username email')
      .populate('reportedUser','username email accountStatus')
      .populate('book','title author')
      .sort({priority:-1,createdAt:-1})
      .limit(8)
      .lean();

    const health = reportsCritical>0 || reportsOpen>5 || blocked>5
      ? 'critical'
      : (reportsOpen>0 || pendingVerifications>0 ? 'warning' : 'ok');

    res.json({
      health,
      kpis:{users,usersWeek,usersMonth,admins,blocked,deleted,books,activeBooks,booksWeek,exchangesCompleted,exchangesPending,exchangesWeek,reportsOpen,reportsReviewing,reportsWaiting,reportsCritical,pendingVerifications,messages,messagesDay},
      topUsers,topGenres,comunas,recentReports,actions
    });
  }catch(e){
    console.error('GET /api/admin/dashboard error:',e);
    res.status(500).json({error:'Error cargando dashboard'});
  }
});

// Ficha completa usuario admin
router.get('/users/:id/detail',auth,requireAdmin,async(req,res)=>{
  try{
    const id=req.params.id;
    const user=await User.findById(id).select('-password -resetPasswordToken -resetPasswordExpires').lean();
    if(!user)return res.status(404).json({error:'Usuario no encontrado'});

    const [books, exchanges, reportsReceived, reportsSent, messagesCount, adminActions] = await Promise.all([
      Book.find({owner:id}).sort({createdAt:-1}).limit(80).lean(),
      Exchange.find({participants:id})
        .populate('participants','username email profilePhoto location accountStatus')
        .populate('requester','username email')
        .populate('matchedUser','username email')
        .populate('myBook','title author photos')
        .populate('theirBook','title author photos')
        .sort({updatedAt:-1}).limit(80).lean(),
      Report.find({reportedUser:id}).populate('reporter','username email').populate('book','title author').sort({createdAt:-1}).limit(50).lean(),
      Report.find({reporter:id}).populate('reportedUser','username email').populate('book','title author').sort({createdAt:-1}).limit(50).lean(),
      Message.countDocuments({sender:id}),
      AdminAction.find({targetId:String(id)}).populate('admin','username email').sort({createdAt:-1}).limit(40).lean()
    ]);

    const openReports=reportsReceived.filter(r=>['open','reviewing','waiting_user'].includes(r.status)).length;
    const completed=exchanges.filter(e=>e.status==='completed').length;
    const pending=exchanges.filter(e=>e.status==='pending').length;

    res.json({user,stats:{books:books.length,activeBooks:books.filter(b=>b.available).length,completed,pending,openReports,reportsReceived:reportsReceived.length,reportsSent:reportsSent.length,messagesCount},books,exchanges,reportsReceived,reportsSent,adminActions});
  }catch(e){
    console.error('GET /api/admin/users/:id/detail error:',e);
    res.status(500).json({error:'Error cargando ficha usuario'});
  }
});

// Reporte detallado
router.get('/reports/:id/detail',auth,requireAdmin,async(req,res)=>{
  try{
    const report=await Report.findById(req.params.id)
      .populate('reporter','username email location profilePhoto accountStatus role verificationStatus completedExchanges level')
      .populate('reportedUser','username email location profilePhoto accountStatus role verificationStatus completedExchanges level')
      .populate('book','title author genre photos owner available')
      .lean();
    if(!report)return res.status(404).json({error:'Reporte no encontrado'});

    const related=await Report.find({
      _id:{$ne:report._id},
      $or:[
        report.reportedUser?{reportedUser:report.reportedUser._id}:null,
        report.reporter?{reporter:report.reporter._id}:null,
        report.book?{book:report.book._id}:null
      ].filter(Boolean)
    }).populate('reporter','username email').populate('reportedUser','username email').populate('book','title author').sort({createdAt:-1}).limit(20).lean();

    res.json({report,related});
  }catch(e){
    console.error('GET /api/admin/reports/:id/detail error:',e);
    res.status(500).json({error:'Error cargando detalle reporte'});
  }
});

module.exports=router;
