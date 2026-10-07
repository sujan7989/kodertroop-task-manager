import React from 'react';
import { CheckSquare } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', message, fullScreen = false }) => {
  const ringSize = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-16 h-16' }[size];
  const iconSize = { sm: 'w-3 h-3', md: 'w-5 h-5', lg: 'w-7 h-7' }[size];

  const spinner = (
    <div className="flex flex-col items-center gap-4">
      <div className={`relative ${ringSize}`}>
        {/* Spinning ring */}
        <div className={`absolute inset-0 rounded-full border-2 border-transparent border-t-primary-500 border-r-accent-purple animate-spin`} />
        {/* Inner icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <CheckSquare className={`${iconSize} text-primary-400 animate-pulse`} />
        </div>
      </div>
      {message && <p className="text-slate-400 text-sm animate-pulse">{message}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center">
        <div className="text-center animate-fade-in-scale">
          <div className="w-20 h-20 relative mb-6 mx-auto">
            <div className="absolute inset-0 rounded-3xl border-2 border-transparent border-t-primary-500 border-r-accent-purple animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <CheckSquare className="w-8 h-8 text-primary-400" />
            </div>
          </div>
          {message && <p className="text-slate-400">{message}</p>}
        </div>
      </div>
    );
  }

  return <div className="flex items-center justify-center">{spinner}</div>;
};

export default LoadingSpinner;
