import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Loader2 } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export function AdminLogin() {
  const { setProfile } = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Particle animation setup
  useEffect(() => {
    const canvas = document.getElementById('particleCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const particleCount = 50;

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 3 + 1;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.size > 0.2) this.size -= 0.01;
      }
      draw() {
        ctx.fillStyle = 'rgba(147, 197, 253, 0.6)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function init() {
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].size <= 0.2) {
          particles.splice(i, 1);
          i--;
          particles.push(new Particle());
        }
      }
      requestAnimationFrame(animate);
    }

    init();
    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, role, permissions, name, phone')
        .eq('id', data.user?.id)
        .single();

      if (profileError) throw profileError;

      if (profileData?.role !== 'admin') {
        throw new Error('Access denied: Admin role required');
      }

      setProfile({
        id: profileData.id,
        email: profileData.email,
        role: profileData.role,
        permissions: profileData.permissions,
        name: profileData.name || '',
        phone: profileData.phone || '',
      });
      toast.success('Login successful! Redirecting to dashboard...');
      setTimeout(() => navigate('/admin'), 1000);
    } catch (error) {
      setError(error.message || 'Invalid email or password');
      toast.error(error.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-cyan-100 to-blue-200 relative overflow-hidden">
      {/* Particle Canvas */}
      <canvas
        id="particleCanvas"
        className="absolute inset-0 pointer-events-none"
      />

      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />

      {/* Neumorphic Glass Card */}
      <div className="relative bg-white/20 backdrop-blur-xl rounded-3xl shadow-2xl p-10 w-full max-w-md border border-sky-200/30 animate-slideIn">
        <h2 className="text-4xl font-extrabold text-sky-900 text-center mb-8 drop-shadow-md">
          Admin Portal
        </h2>

        {error && (
          <div className="mb-6 p-4 bg-red-100/80 text-red-800 rounded-xl text-sm border border-red-300/50 animate-pulseError">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-8">
          <div className="relative">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-sky-800"
            >
              Email Address
            </label>
            <div className="mt-2 relative group">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-14 pr-4 py-4 rounded-xl bg-sky-50/50 border border-sky-300/50 text-sky-900 placeholder-sky-400/70 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-200/50 transition-all duration-500 ease-in-out shadow-inner hover:shadow-cyan-300/30"
                placeholder="admin@example.com"
                required
              />
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-sky-500 group-hover:text-cyan-400 w-6 h-6 transition-all duration-300 group-hover:scale-110" />
            </div>
          </div>

          <div className="relative">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-sky-800"
            >
              Password
            </label>
            <div className="mt-2 relative group">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-14 pr-4 py-4 rounded-xl bg-sky-50/50 border border-sky-300/50 text-sky-900 placeholder-sky-400/70 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-200/50 transition-all duration-500 ease-in-out shadow-inner hover:shadow-cyan-300/30"
                placeholder="••••••••"
                required
              />
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-sky-500 group-hover:text-cyan-400 w-6 h-6 transition-all duration-300 group-hover:scale-110" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-4 px-6 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-300 text-white font-semibold shadow-lg hover:from-cyan-500 hover:to-blue-400 focus:outline-none focus:ring-4 focus:ring-cyan-300/50 transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 relative overflow-hidden group"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-cyan-300/50 to-blue-200/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <span className="relative z-10">Sign In</span>
            )}
          </button>
        </form>

        {/* Forgot Password Link */}
        <div className="mt-6 text-center">
          <a
            href="/forgot-password"
            className="text-sm text-sky-600 hover:text-cyan-400 transition-colors duration-300 hover:underline"
          >
            Forgot your password?
          </a>
        </div>
      </div>

      
    </div>
  );
}