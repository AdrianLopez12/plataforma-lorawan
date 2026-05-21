import { type ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  color: 'teal' | 'blue' | 'amber' | 'red' | 'purple' | 'gray';
}

const colorMap = {
  teal:   { bg: '#E1F5EE', icon: '#0F6E56', text: '#085041' },
  blue:   { bg: '#E6F1FB', icon: '#185FA5', text: '#0C447C' },
  amber:  { bg: '#FAEEDA', icon: '#854F0B', text: '#633806' },
  red:    { bg: '#FCEBEB', icon: '#A32D2D', text: '#791F1F' },
  purple: { bg: '#EEEDFE', icon: '#534AB7', text: '#3C3489' },
  gray:   { bg: '#F1EFE8', icon: '#5F5E5A', text: '#444441' },
};

export default function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: c.bg, color: c.icon }}>
        {icon}
      </div>
      <div className="stat-body">
        <div className="stat-title">{title}</div>
        <div className="stat-value" style={{ color: c.text }}>{value}</div>
        {subtitle && <div className="stat-subtitle">{subtitle}</div>}
      </div>
    </div>
  );
}
