const express=require('express');
const auth=require('../middleware/auth');
const User=require('../models/User'),Book=require('../models/Book'),Exchange=require('../models/Exchange'),Message=require('../models/Message'),Report=require('../models/Report'),AdminAction=require('../models/AdminAction');
const router=express.Router();
function adminEmails(){return String(process.env.ADMIN_EMAILS||process.env.ADMIN_EMAIL||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)}
async function requireAdmin(req,res,next){const u=await User.findById(req.userId);if(!u)return res.status(401).json({error:'Usuario no encontrado'});if(!(u.role==='admin'||adminEmails().includes(String(u.email).toLowerCase())))return res.status(403).json({error:'Acceso solo para administrador'});req.adminUser=u;next()}
async function log(req,action,targetType,targetId,detail={}){try{await AdminAction.create({admin:req.adminUser._id,action,targetType,targetId:String(targetId||''),detail})}catch{}}
router.get('/whoami',auth,async(req,res)=>{const u=await User.findById(req.userId).select('-password');const isAdmin=!!u&&(u.role==='admin'||adminEmails().includes(String(u.email).toLowerCase()));res.json({ok:true,isAdmin,user:u?{id:u._id,username:u.username,email:u.email,role:u.role,accountStatus:u.accountStatus}:null})});
router.get('/summary',auth,requireAdmin,async(req,res)=>{const start=new Date(new Date().getFullYear(),new Date().getMonth(),1);const vals=await Promise.all([User.countDocuments({accountStatus:{$ne:'deleted'}}),User.countDocuments({role:'admin'}),User.countDocuments({accountStatus:'blocked'}),User.countDocuments({accountStatus:'deleted'}),Book.countDocuments(),Book.countDocuments({available:true}),Exchange.countDocuments({status:'completed'}),Exchange.countDocuments({status:'pending'}),Message.countDocuments(),Report.countDocuments({status:'open'}),User.countDocuments({profilePhoto:{$ne:''},verificationStatus:'pending'}),User.countDocuments({createdAt:{$gte:start}})]);res.json({users:vals[0],admins:vals[1],blocked:vals[2],deleted:vals[3],books:vals[4],activeBooks:vals[5],completed:vals[6],pending:vals[7],messages:vals[8],reportsOpen:vals[9],pendingVerifications:vals[10],newUsersMonth:vals[11]})});
router.get('/users',auth,requireAdmin,async(req,res)=>{
  const q=String(req.query.q||'').trim();
  const includeDeleted=String(req.query.includeDeleted||'')==='true';

  const baseFilter=includeDeleted?{}:{accountStatus:{$ne:'deleted'}};
  const searchFilter=q?{$or:[
    {username:new RegExp(q,'i')},
    {email:new RegExp(q,'i')},
    {location:new RegExp(q,'i')}
  ]}:{};

  const filter=q?{$and:[baseFilter,searchFilter]}:baseFilter;

  const users=await User.find(filter).select('-password -resetPasswordToken -resetPasswordExpires').sort({createdAt:-1}).limit(500);
  const ids=users.map(u=>u._id);

  const counts=await Book.aggregate([
    {$match:{owner:{$in:ids}}},
    {$group:{_id:'$owner',total:{$sum:1},active:{$sum:{$cond:['$available',1,0]}}}}
  ]);

  const m={};
  counts.forEach(x=>m[String(x._id)]=x);

  res.json(users.map(u=>{
    const o=u.toJSON();
    o.totalBooks=m[String(u._id)]?.total||0;
    o.activeBooks=m[String(u._id)]?.active||0;
    return o;
  }));
});
router.delete('/books/:id',auth,requireAdmin,async(req,res)=>{await Book.findByIdAndDelete(req.params.id);await log(req,'delete_book','book',req.params.id,{});res.json({ok:true})});
module.exports=router;
