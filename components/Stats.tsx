import React from 'react';
import { Issue } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface StatsProps {
  issues: Issue[];
  ignoredIds: Set<string>;
  uiLanguage: 'zh' | 'en';
}

export const Stats: React.FC<StatsProps> = ({ issues, ignoredIds, uiLanguage }) => {
  const activeIssues = issues.filter(i => !ignoredIds.has(i.id));
  
  const T = {
    zh: {
      dist: "问题分布",
      total: "总问题数",
      unique: "唯一 Key"
    },
    en: {
      dist: "Issue Distribution",
      total: "Total Issues",
      unique: "Unique Keys"
    }
  }[uiLanguage];

  const counts = {
    critical: activeIssues.filter(i => i.severity === 'critical').length,
    high: activeIssues.filter(i => i.severity === 'high').length,
    medium: activeIssues.filter(i => i.severity === 'medium').length,
    low: activeIssues.filter(i => i.severity === 'low').length,
    info: activeIssues.filter(i => i.severity === 'info').length,
  };

  const data = [
    { name: 'Critical', count: counts.critical, color: '#fb7185' },
    { name: 'High', count: counts.high, color: '#fbbf24' },
    { name: 'Medium', count: counts.medium, color: '#60a5fa' },
    { name: 'Low', count: counts.low, color: '#94a3b8' },
    { name: 'Info', count: counts.info, color: '#4ade80' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">{T.dist}</h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={60} tick={{fill: '#94a3b8', fontSize: 12}} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                itemStyle={{ color: '#f8fafc' }}
                cursor={{fill: 'rgba(255,255,255,0.05)'}}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center justify-center p-2 bg-slate-800 rounded-lg">
          <span className="text-xs text-slate-400">{T.total}</span>
          <span className="text-2xl font-bold text-white">{activeIssues.length}</span>
        </div>
         <div className="flex flex-col items-center justify-center p-2 bg-slate-800 rounded-lg">
          <span className="text-xs text-slate-400">{T.unique}</span>
          <span className="text-2xl font-bold text-white">{new Set(activeIssues.map(i => i.key)).size}</span>
        </div>
      </div>
    </div>
  );
};