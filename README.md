# 🎬 W2tch - Cinema-Grade Watch Party Platform

**W2tch** is a high-performance, real-time watch party platform designed for cinema-grade screen sharing and seamless collaboration. Built with WebRTC and Socket.io, it delivers ultra-low latency 4K 60FPS streaming with premium aesthetics.

![W2tch Preview](https://w2tch.onrender.com)
## 🚀 Key Features

### 💎 Cinema-Grade Screen Sharing
- **Strict 4K 60FPS**: Forced high-resolution constraints for pixel-perfect clarity.
- **Ultra-High Bitrate**: Massive 50 Mbps data pipeline with a 15 Mbps floor to prevent blurring.
- **Maintain Resolution**: Intelligent degradation preference that prioritizes clarity over frame drops, perfect for movies.
- **Hot-Swap Sync**: Real-time track synchronization that allows participants to see the shared screen instantly without refreshing.

### 📊 Real-Time Telemetry
- **Dynamic Bandwidth Meter**: A premium, "Dynamic Island" style visual bitrate tracker.
- **Connection Health**: Real-time color-coded feedback (Green/Amber/Red) based on current Mbps.
- **Live Quality Info**: Detailed stats about your current stream resolution and FPS targets.

### 🎨 Premium UI/UX
- **Glassmorphism Design**: A modern, sleek interface with blurred panels and vibrant gradients.
- **Responsive Layout**: Optimized for both desktop and mobile viewing with safe-area support.
- **Customizable Rooms**: Password-protected rooms with custom titles, descriptions, and member limits.
- **Interactive Reactions**: Real-time floating emoji reactions for synchronized social interaction.

## 🛠️ Tech Stack
- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Real-Time Communication**: [WebRTC](https://webrtc.org/) & [Socket.io](https://socket.io/)
- **Icons**: [Lucide-React](https://lucide.dev/)
- **Styling**: Vanilla CSS (Advanced Glassmorphism & Animations)

## 📦 Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/AxonCodez/w2tch.git
   cd w2tch
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## ⚙️ Performance Architecture
- **SDP Munging**: Custom SDP processor to force high-bitrate video encoding (`x-google-max-bitrate=50000`) and studio-quality stereo audio.
- **Track Lifecycle**: Robust `ontrack` handling with explicit track ejection to prevent "blank screen" issues during source switching.
- **Network Resilience**: Automatic ICE re-negotiation and bitrate adaptation to maintain 4K quality.

## 📄 License
This project is licensed under the MIT License.

---
Built with ❤️ for the ultimate watch party experience.
