require('dotenv').config();
const express=require('express'),mongoose=require('mongoose'),cors=require('cors'),path=require('path'),http=require('http'),{Server}=require('socket.io'),jwt=require('jsonwebtoken');
const app=express();const server=http.createServer(app);
if(!process.env.JWT_SECRET){console.error('❌ JWT_SECRET no está definido');process.exit(1)}
if(!process.env.MONGODB_URI){console.error('❌ MONGODB_URI no está definido');process.exit(1)}
app.use(cors());app.use(express.json({limit:'20mb'}));app.use(express.urlencoded({limit:'20mb',extended:true}));
app.use(express.static(path.join(__dirname,'public')));
app.use('/api/auth',require('./routes/auth'));app.use('/api/users',require('./routes/users'));app.use('/api/books',require('./routes/books'));app.use('/api/swipes',require('./routes/swipes'));app.use('/api/chat',require('./routes/chat'));app.use('/api/exchanges',require('./routes/exchanges'));app.use('/api/notifications',require('./routes/notifications'));app.use('/api/admin',require('./routes/admin'));
app.get('/api/health',(_req,res)=>res.json({status:'ok',version:'3.1.0',socket:'enabled'}));
const io=new Server(server,{cors:{origin:'*',methods:['GET','POST']},transports:['websocket','polling'],pingTimeout:30000,pingInterval:25000});
const Message=require('./models/Message');const Notification=require('./models/Notification');
io.use((socket,next)=>{try{const token=socket.handshake.auth?.token;if(!token)return next(new Error('Auth requerida'));const d=jwt.verify(token,process.env.JWT_SECRET);const uid=d.id||d._id||d.userId||d.uid||d.sub;if(!uid)return next(new Error('Token sin usuario'));socket.userId=String(uid);next()}catch{next(new Error('Token inválido'))}});
io.on('connection',socket=>{
 socket.on('join-chat',(roomId,cb)=>{if(!roomId){cb&&cb({ok:false,error:'Sala inválida'});return}socket.join(roomId);cb&&cb({ok:true,roomId})});
 socket.on('send-message',async({roomId,text,clientId},cb)=>{try{if(!roomId||!text?.trim()){cb&&cb({ok:false,error:'Mensaje vacío'});return}const msg=await Message.create({roomId,sender:socket.userId,text:text.trim().slice(0,500)});await msg.populate('sender','username email');const payload={_id:msg._id,roomId:msg.roomId,sender:msg.sender,text:msg.text,createdAt:msg.createdAt,updatedAt:msg.updatedAt,clientId:clientId||null};io.to(roomId).emit('new-message',payload);const other=String(roomId).split('_').find(x=>x!==String(socket.userId));if(other){await Notification.create({user:other,type:'message',title:'Nuevo mensaje',body:payload.text.slice(0,80),data:{roomId,sender:socket.userId}});io.to(roomId).emit('notification-update',{user:other,type:'message'})}cb&&cb({ok:true,message:payload})}catch(err){console.error('send-message',err);cb&&cb({ok:false,error:'No se pudo enviar el mensaje'});socket.emit('message-error',{error:'No se pudo enviar el mensaje'})}});
 socket.on('typing',({roomId,username})=>{if(roomId)socket.to(roomId).emit('user-typing',{username:username||'Usuario'})});socket.on('stop-typing',({roomId})=>{if(roomId)socket.to(roomId).emit('user-stop-typing')});
});
app.get('*',(_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const PORT=process.env.PORT||4000;mongoose.connect(process.env.MONGODB_URI).then(()=>server.listen(PORT,()=>console.log('🚀 Servidor en puerto '+PORT))).catch(err=>{console.error('❌ MongoDB:',err.message);process.exit(1)});
