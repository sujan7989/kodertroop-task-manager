import React from 'react';

const SkeletonCard: React.FC<{ wide?: boolean }> = ({ wide = false }) => (
  <div className="glass rounded-2xl p-4 lg:p-5 border border-border/50 overflow-hidden relative">
    <div className="absolute inset-0 shimmer" />
    <div className="flex items-start gap-3 ml-3">
      {/* Checkbox skeleton */}
      <div className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-lg bg-slate-700/60" />
      {/* Content */}
      <div className="flex-1 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className={`h-4 rounded-lg bg-slate-700/60 ${wide ? 'w-3/4' : 'w-1/2'}`} />
          <div className="h-5 w-16 rounded-full bg-slate-700/60" />
        </div>
        <div className="h-3 w-full rounded-lg bg-slate-700/40" />
        <div className="h-3 w-4/5 rounded-lg bg-slate-700/40" />
        <div className="flex gap-3 mt-3">
          <div className="h-3 w-24 rounded-lg bg-slate-700/30" />
          <div className="h-3 w-20 rounded-lg bg-slate-700/30" />
        </div>
      </div>
      {/* Action buttons skeleton */}
      <div className="flex gap-1.5 flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-slate-700/40" />
        <div className="w-8 h-8 rounded-xl bg-slate-700/40" />
      </div>
    </div>
  </div>
);

const TaskSkeleton: React.FC = () => (
  <div className="space-y-3">
    <SkeletonCard wide />
    <SkeletonCard />
    <SkeletonCard wide />
  </div>
);

export default TaskSkeleton;
