import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ className = '', size = 'lg' }: LogoProps) {
  const sizes = {
    sm: 'h-12',
    md: 'h-16',
    lg: 'h-20'
  };

  return (
    <img 
      src="https://raw.githubusercontent.com/Naveen06-A/image-/451d7ca2516e5ab3862be90d6f5b448d48ade876/red-tulip-logo.jpg"
      alt="Red Tulip Enterprises Logo"
      className={`${sizes[size]} w-auto ${className}`}
      data-logo
    />
  );
}