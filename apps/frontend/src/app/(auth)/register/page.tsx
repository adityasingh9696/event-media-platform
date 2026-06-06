'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, User, Star, ArrowRight, Chrome, Camera, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import toast from 'react-hot-toast';

const registerSchema = z.object({
  displayName: z.string().min(2, 'Display name must be at least 2 characters'),
  username: z.string().min(3, 'Username must be at least 3 characters').regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores allowed'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

const floatingCards = [
  { rotate: -8, x: -60, y: 20, delay: 0, color: 'from-pink-500/20 to-violet-500/20' },
  { rotate: 5, x: 40, y: -30, delay: 0.5, color: 'from-blue-500/20 to-cyan-500/20' },
  { rotate: -3, x: -20, y: 80, delay: 1, color: 'from-amber-500/20 to-orange-500/20' },
];

const stats = [
  { label: 'Events', value: '2,400+' },
  { label: 'Photos', value: '180K+' },
  { label: 'Members', value: '3,200+' },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser, isAuthenticated } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace('/');
  }, [isAuthenticated, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      await registerUser(data.email, data.password, data.username, data.displayName);
      toast.success('Account created successfully!');
      router.push('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  };

  return (
    <div className="min-h-dvh flex">
      {/* Left Panel — Animated hero (split screen layout) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col items-center justify-center p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#0d0d1a] to-[#111118]" />
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-accent/10 blur-[80px]" />
          <div className="absolute bottom-20 right-20 w-80 h-80 rounded-full bg-violet/10 blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-accent/5 blur-[120px]" />
        </div>

        {floatingCards.map((card, i) => (
          <motion.div
            key={i}
            className={`absolute w-36 h-28 rounded-2xl bg-gradient-to-br ${card.color} border border-white/10 backdrop-blur-sm`}
            style={{ rotate: card.rotate, x: card.x, y: card.y }}
            animate={{
              y: [card.y, card.y - 15, card.y],
              rotate: [card.rotate, card.rotate + 2, card.rotate],
            }}
            transition={{
              duration: 4 + i,
              repeat: Infinity,
              delay: card.delay,
              ease: 'easeInOut',
            }}
          >
            <div className="p-3 flex flex-col gap-2">
              <div className="flex gap-1.5">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="w-2 h-2 rounded-full bg-white/20" />
                ))}
              </div>
              <div className="w-full h-14 rounded-lg bg-white/10 flex items-center justify-center">
                <Camera size={20} className="text-white/40" />
              </div>
            </div>
          </motion.div>
        ))}

        <div className="relative z-10 text-center space-y-6 max-w-sm">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center gap-3"
          >
            <div className="w-14 h-14 rounded-2xl gradient-bg flex items-center justify-center shadow-glow-lg">
              <Zap size={28} className="text-white" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <h1 className="text-4xl font-bold mb-2">
              <span className="gradient-text">Join The</span>{' '}
              <span className="text-foreground">Creative</span>{' '}
              <span className="gradient-text">Circle.</span>
            </h1>
            <p className="text-muted text-lg leading-relaxed">
              Create an account and start managing your event albums, media, and sharing them instantly.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex justify-center gap-8"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold gradient-text">{stat.value}</p>
                <p className="text-xs text-muted mt-0.5">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Right Panel — Register Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="w-full max-w-md my-8"
        >
          <motion.div variants={itemVariants} className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center shadow-glow">
              <Zap size={18} className="text-white" />
            </div>
            <span className="gradient-text font-bold text-2xl">MediaHub</span>
          </motion.div>

          <motion.div variants={itemVariants} className="mb-6">
            <h2 className="text-3xl font-bold text-foreground">Create your account</h2>
            <p className="text-muted mt-2">Get started with our free media platform</p>
          </motion.div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <motion.div variants={itemVariants}>
              <Input
                label="Full Name"
                type="text"
                leftIcon={<User size={16} />}
                error={errors.displayName?.message}
                {...register('displayName')}
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <Input
                label="Username"
                type="text"
                leftIcon={<User size={16} />}
                error={errors.username?.message}
                {...register('username')}
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <Input
                label="Email address"
                type="email"
                leftIcon={<Mail size={16} />}
                error={errors.email?.message}
                {...register('email')}
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                leftIcon={<Lock size={16} />}
                rightIcon={showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                onRightIconClick={() => setShowPassword(!showPassword)}
                error={errors.password?.message}
                {...register('password')}
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <Input
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                leftIcon={<Lock size={16} />}
                rightIcon={showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                onRightIconClick={() => setShowConfirmPassword(!showConfirmPassword)}
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
            </motion.div>

            <motion.div variants={itemVariants} className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                isLoading={isLoading}
                rightIcon={<ArrowRight size={16} />}
              >
                Get Started
              </Button>
            </motion.div>
          </form>

          <motion.p variants={itemVariants} className="mt-6 text-center text-sm text-muted">
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:text-accent-light font-medium transition-colors">
              Sign in
            </Link>
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
