# Changelog

All notable changes to this project will be documented in this file.

## [v1.0.0] - 2025-10-07

### 🎉 Initial Release

#### ✨ Features Added
- 🎵 **Play Music** - Play songs from YouTube with `!play <url>`
- ⏭️ **Skip Songs** - Skip current song with `!skip`
- ⏹️ **Stop Playback** - Stop and clear queue with `!stop`
- ⏸️ **Pause/Resume** - Pause with `!pause` and resume with `!resume`
- 🔊 **Volume Control** - Adjust volume with `!volume <0-100>`
- 📋 **Queue Management** - View queue with `!queue`
- 🎵 **Now Playing** - Check current song with `!nowplaying` or `!np`
- 📚 **Help Command** - Get all commands with `!help`

#### 🤖 Smart Features
- 🎲 **Autoplay** - Automatically plays random Anime and Thai Rap songs when queue is empty
- 👋 **Auto Leave** - Bot leaves voice channel when:
  - No humans remain in the channel
  - No music playing for 60 seconds
- 💬 **Smart Messaging** - Bot sends messages in the same text channel throughout the session
- 🛡️ **Fallback Streaming** - Uses yt-dlp with play-dl fallback for maximum compatibility

#### 🔧 Technical Features
- ✅ YouTube Cookie support for restricted videos
- ✅ Multi-song queue system
- ✅ Real-time song title display
- ✅ Voice channel monitoring
- ✅ Error handling and recovery
- ✅ PM2 process management support
- ✅ Windows auto-start on boot

#### 📝 Documentation
- ✅ Complete README.md with installation guide
- ✅ COMMANDS.md with detailed command documentation
- ✅ Auto-start scripts for Windows
- ✅ Bot control panel (bot-control.bat)

#### 🎮 Commands Available
```
📀 Playback:
  !play <url>  - Play a song
  !skip        - Skip current song
  !stop        - Stop and clear queue
  !pause       - Pause playback
  !resume      - Resume playback

📋 Queue:
  !queue       - Show song queue
  !nowplaying  - Show current song
  !np          - Show current song (short)

🔊 Settings:
  !volume <0-100> - Adjust volume
  !help           - Show all commands
```

#### 🎯 Music Categories
- 🎌 Anime: Opening, Ending, OST, J-Pop
- 🎤 Thai Rap: Thai Hip-Hop, Thai Rap songs

---

### 🔮 Future Plans
- [ ] Playlist support
- [ ] Search by keywords
- [ ] Loop/repeat commands
- [ ] Shuffle queue
- [ ] Save favorite playlists
- [ ] Web dashboard

---

## Links
- **GitHub Repository**: https://github.com/xzasakue12/bot-dome
- **Release Tag**: v1.0.0

---

<div align="center">
  <p>Made with ❤️ for Discord Music Lovers</p>
  <p>🎵 v1.0.0 - Full Release 🎵</p>
</div>
