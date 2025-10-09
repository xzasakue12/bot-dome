// require('dotenv').config();
// const { Client, GatewayIntentBits } = require('discord.js');
// const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
// const playdl = require('play-dl');
// const ytdl = require('ytdl-core');
// const { spawn } = require('child_process');
// const path = require('path');

// const client = new Client({
//     intents: [
//         GatewayIntentBits.Guilds,
//         GatewayIntentBits.GuildVoiceStates,
//         GatewayIntentBits.GuildMessages,
//         GatewayIntentBits.MessageContent
//     ]
// });

// client.once('ready', async () => {
//     if (process.env.YT_COOKIE) {
//         await playdl.setToken({ youtube: { cookie: process.env.YT_COOKIE } });
//         console.log('YouTube cookie loaded!');
//     }
//     console.log(`Logged in as ${client.user.tag}`);
// });

// // --- เพิ่มระบบคิวเพลง ---
// const queue = [];
// let isPlaying = false;
// let currentConnection = null;
// let currentPlayer = null;
// let leaveTimeout = null;
// let lastPlayedVideoId = null;
// let lastTextChannel = null;

// function getYtDlpPath() {
//     if (process.platform === 'win32') {
//         return path.resolve(__dirname, 'yt-dlp.exe');
//     } else {
//         return path.resolve(__dirname, 'yt-dlp');
//     }
// }

// async function playNext(guildId, lastVideoId = null) {
//     if (leaveTimeout) clearTimeout(leaveTimeout);
//     if (global.nextTimeout) clearTimeout(global.nextTimeout);

//     // ใช้ lastPlayedVideoId ถ้า lastVideoId ไม่ถูกส่งมา
//     if (!lastVideoId && lastPlayedVideoId) {
//         lastVideoId = lastPlayedVideoId;
//     }

//     if (queue.length > 0) {
//         // มีเพลงในคิว เล่นทันที ไม่ต้องรอ
//         isPlaying = true;
//         const { cleanUrl, voiceChannel, message } = queue.shift();
//         lastTextChannel = message.channel; // เก็บ text channel ล่าสุด
//         let videoId = null;
//         try {
//             videoId = playdl.extractID(cleanUrl);
//         } catch {}
//         if (videoId) lastPlayedVideoId = videoId;
//         const connection = joinVoiceChannel({
//             channelId: voiceChannel.id,
//             guildId: voiceChannel.guild.id,
//             adapterCreator: voiceChannel.guild.voiceAdapterCreator
//         });
//         currentConnection = connection;
//         let resource;
//         try {
//             let stream;
//             try {
//                 stream = await playdl.stream(cleanUrl);
//             } catch (err) {
//                 console.log('play-dl stream error:', err.message);
//             }
//             if (stream && stream.stream) {
//                 resource = createAudioResource(stream.stream, { inputType: stream.type });
//             } else {
//                 try {
//                     console.log('Using yt-dlp fallback...');
//                     const ytdlp = spawn(getYtDlpPath(), [
//                         '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
//                         '-o', '-',
//                         '--no-playlist',
//                         '--quiet',
//                         '--no-warnings',
//                         '--no-check-certificate',
//                         '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
//                         cleanUrl
//                     ], { shell: false, windowsHide: true });
                    
//                     ytdlp.stderr.on('data', (data) => {
//                         console.error(`yt-dlp error: ${data}`);
//                     });
                    
//                     ytdlp.on('error', (error) => {
//                         console.error(`yt-dlp spawn error: ${error}`);
//                         message.reply('ไม่สามารถเล่นเพลงนี้ได้ (yt-dlp spawn error)');
//                         connection.destroy();
//                         isPlaying = false;
//                         return;
//                     });
                    
//                     resource = createAudioResource(ytdlp.stdout);
//                 } catch (e) {
//                     console.error('yt-dlp creation error:', e);
//                     message.reply('ไม่สามารถเล่นเพลงนี้ได้ (yt-dlp error)');
//                     connection.destroy();
//                     isPlaying = false;
//                     return;
//                 }
//             }
//             const player = createAudioPlayer();
//             currentPlayer = player;
//             player.play(resource);
//             connection.subscribe(player);
//             player.on('error', (err) => {
//                 console.error('Audio player error:', err.message);
//             });
//             player.on(AudioPlayerStatus.Idle, () => {
//                 playNext(guildId, videoId);
//             });
//         } catch (error) {
//             console.error('Playback error:', error);
//             message.reply('เกิดข้อผิดพลาดในการเล่นเพลง');
//             connection.destroy();
//             isPlaying = false;
//         }
//         return;
//     }

//     // ถ้าคิวว่าง รอ 15 วิ ถ้าไม่มีใครเพิ่มเพลงใหม่ ให้ autoplay
//     if (queue.length === 0) {
//         if (lastVideoId) {
//             // แจ้งเตือนในแชท
//             if (lastTextChannel && typeof lastTextChannel.send === 'function') {
//                 try {
//                     lastTextChannel.send('🎵 รอ 15 วินาที... ถ้าไม่มีเพลงใหม่จะเล่นเพลงต่อไปอัตโนมัติ!');
//                 } catch {}
//             }
            
//             global.nextTimeout = setTimeout(async () => {
//                 if (queue.length === 0) {
//                     // --- Autoplay: หาเพลงแนะนำจาก YouTube ---
//                     try {
//                         console.log('🎵 Searching for next song...');
//                         let nextUrl = null;
                        
//                         // ลองใช้ play-dl ก่อน
//                         try {
//                             const info = await playdl.video_basic_info(`https://www.youtube.com/watch?v=${lastVideoId}`);
//                             if (info && Array.isArray(info.related_videos) && info.related_videos.length > 0) {
//                                 console.log('Found', info.related_videos.length, 'related videos from play-dl');
//                                 for (const item of info.related_videos) {
//                                     if (typeof item === 'string' && item.startsWith('https://www.youtube.com/watch?v=')) {
//                                         nextUrl = item;
//                                         break;
//                                     } else if (item && typeof item === 'object' && typeof item.url === 'string' && item.url.startsWith('https://www.youtube.com/watch?v=')) {
//                                         nextUrl = item.url;
//                                         break;
//                                     }
//                                 }
//                             }
//                         } catch (err) {
//                             console.log('play-dl related videos error:', err.message);
//                         }
                        
//                         // Fallback 1: ค้นหาเพลงยอดนิยม
//                         if (!nextUrl) {
//                             try {
//                                 console.log('🔍 Fallback: Searching for trending music...');
//                                 const searchQueries = [
//                                     'popular music 2024',
//                                     'top hits 2024',
//                                     'trending songs',
//                                     'best music 2024',
//                                     'viral songs'
//                                 ];
//                                 const randomQuery = searchQueries[Math.floor(Math.random() * searchQueries.length)];
//                                 const searchResults = await playdl.search(randomQuery, { 
//                                     limit: 20, 
//                                     source: { youtube: 'video' } 
//                                 });
                                
//                                 if (searchResults && searchResults.length > 0) {
//                                     const randomIndex = Math.floor(Math.random() * searchResults.length);
//                                     nextUrl = searchResults[randomIndex].url;
//                                     console.log('✅ Found from search:', searchResults[randomIndex].title);
//                                 }
//                             } catch (searchErr) {
//                                 console.log('Search fallback error:', searchErr.message);
//                             }
//                         }
                        
//                         // หา voice channel
//                         let voiceChannel;
//                         if (currentConnection && currentConnection.joinConfig) {
//                             voiceChannel = {
//                                 id: currentConnection.joinConfig.channelId,
//                                 guild: { 
//                                     id: currentConnection.joinConfig.guildId, 
//                                     voiceAdapterCreator: currentConnection.joinConfig.adapterCreator 
//                                 }
//                             };
//                         } else {
//                             const guild = client.guilds.cache.get(guildId);
//                             if (guild) {
//                                 const member = guild.members.me;
//                                 if (member && member.voice && member.voice.channelId) {
//                                     voiceChannel = {
//                                         id: member.voice.channelId,
//                                         guild: { id: guildId, voiceAdapterCreator: guild.voiceAdapterCreator }
//                                     };
//                                 }
//                             }
//                         }
                        
//                         if (nextUrl && voiceChannel) {
//                             console.log('🎵 Autoplay next:', nextUrl);
//                             queue.push({ 
//                                 cleanUrl: nextUrl, 
//                                 voiceChannel, 
//                                 message: { 
//                                     reply: () => {},
//                                     channel: lastTextChannel
//                                 } 
//                             });
//                             try {
//                                 lastPlayedVideoId = playdl.extractID(nextUrl);
//                             } catch {}
                            
//                             // แจ้งเตือนในแชท
//                             if (lastTextChannel && typeof lastTextChannel.send === 'function') {
//                                 try {
//                                     lastTextChannel.send('🎵 กำลังเล่นเพลงต่อไปอัตโนมัติ...');
//                                 } catch {}
//                             }
                            
//                             return playNext(guildId, lastPlayedVideoId);
//                         } else {
//                             console.log('❌ Cannot autoplay: no URL or voice channel');
//                         }
//                     } catch (e) {
//                         console.log('Autoplay error:', e.message);
//                     }
                    
//                     // ถ้ายังไม่ได้เพลง ออกจาก voice channel
//                     if (queue.length === 0 && currentConnection) {
//                         if (lastTextChannel && typeof lastTextChannel.send === 'function') {
//                             try {
//                                 lastTextChannel.send('❌ ไม่พบเพลงต่อไป จะออกจากห้องเสียงใน 1 นาที');
//                             } catch {}
//                         }
//                         leaveTimeout = setTimeout(() => {
//                             if (currentConnection) {
//                                 currentConnection.destroy();
//                                 console.log('Left voice channel after inactivity');
//                             }
//                             isPlaying = false;
//                         }, 60000);
//                     }
//                 } else {
//                     playNext(guildId);
//                 }
//             }, 15000);
//             return;
//         }
        
//         // ไม่มีเพลงแนะนำหรือคิวว่างจริง ๆ ค่อย destroy
//         if (currentConnection) {
//             leaveTimeout = setTimeout(() => {
//                 if (currentConnection) {
//                     currentConnection.destroy();
//                     console.log('Left voice channel after 1 minute of inactivity.');
//                 }
//                 isPlaying = false;
//             }, 60000);
//         }
//         isPlaying = false;
//         return;
//     }
// }

// client.on('messageCreate', async (message) => {
//     if (!message.content.startsWith('!play') || message.author.bot) return;

//     const urlMatch = message.content.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\S+/i);
//     const url = urlMatch ? urlMatch[0].split('&')[0] : null;

//     if (!url || typeof url !== 'string' || !url.startsWith('http')) {
//         return message.reply('กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง');
//     }
    
//     let videoId;
//     let cleanUrl;
//     try {
//         videoId = playdl.extractID(url);
//         cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
//     } catch (e) {
//         console.log('Error extracting videoId:', e);
//         return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้');
//     }
    
//     if (!videoId) {
//         return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้');
//     }
    
//     const validateResult = playdl.yt_validate(cleanUrl);
//     if (validateResult !== 'video') {
//         return message.reply('กรุณาใส่ลิงก์ YouTube วิดีโอเท่านั้น');
//     }
    
//     let info;
//     try {
//         info = await playdl.video_basic_info(cleanUrl);
//         if (!info || !info.video_details || !info.video_details.id) {
//             return message.reply('ไม่สามารถอ่านข้อมูลวิดีโอได้');
//         }
//     } catch (e) {
//         console.log('video_basic_info error:', e);
//         return message.reply('ไม่สามารถอ่านข้อมูลวิดีโอได้');
//     }
    
//     const voiceChannel = message.member.voice.channel;
//     if (!voiceChannel) return message.reply('คุณต้องอยู่ในห้องเสียงก่อน');

//     queue.push({ cleanUrl, voiceChannel, message });
//     message.reply(`✅ เพิ่มเพลง: **${info.video_details.title}**`);
    
//     if (!isPlaying) {
//         playNext(voiceChannel.guild.id);
//     }
// });

// client.on('messageCreate', (message) => {
//     if (message.content.startsWith('!skip') && !message.author.bot) {
//         if (currentPlayer) {
//             currentPlayer.stop();
//             message.reply('⏭️ ข้ามเพลงนี้แล้ว!');
//         } else {
//             message.reply('❌ ไม่มีเพลงที่กำลังเล่นอยู่');
//         }
//     }
// });

// client.login(process.env.TOKEN);
