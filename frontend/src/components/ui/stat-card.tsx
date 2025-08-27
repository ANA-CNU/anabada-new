import React from 'react';
import { Card, CardContent } from './card';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  iconColor?: string;
  valueColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  value,
  label,
  iconColor = 'text-blue-400',
  valueColor = 'text-white'
}) => {
  return (
    <Card className="bg-white/5 border-white/20 text-white">
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <Icon className={`w-8 h-8 ${iconColor}`} />
          <div>
            <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
            <div className="text-sm text-gray-300">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
