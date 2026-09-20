import { type LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

const colorMap = {
  blue: 'bg-primary-50 text-primary-600',
  green: 'bg-medical-50 text-medical-600',
  yellow: 'bg-warning-50 text-warning-600',
  red: 'bg-red-50 text-red-600',
  purple: 'bg-accent-50 text-accent-600',
};

export function StatCard({ title, value, icon: Icon, color = 'blue' }: StatCardProps) {
  return (
    <div className="card group hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 tabular-nums">{value}</p>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform group-hover:scale-105 ${colorMap[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
