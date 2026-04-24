const mongoose=require('mongoose');
const notificationSchema=new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},type:{type:String,enum:['match','message','exchange_confirmed','exchange_completed','level_up','system'],required:true,index:true},title:{type:String,required:true,maxlength:120},body:{type:String,default:'',maxlength:300},read:{type:Boolean,default:false,index:true},data:{type:Object,default:{}}},{timestamps:true});
module.exports=mongoose.model('Notification',notificationSchema);
