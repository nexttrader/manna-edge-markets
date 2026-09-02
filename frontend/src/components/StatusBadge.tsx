import React from 'react';
import './StatusBadge.css';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const norm = (status || 'awaiting_entry').toLowerCase();

  const getStatusClass = (st: string) => {
    switch (st) {
      case 'active':
        return 'status-active';
      case 'runner':
        return 'status-runner';
      case 'awaiting_entry':
        return 'status-awaiting';
      case 'invalidated':
        return 'status-invalidated';
      case 'superseded':
        return 'status-superseded';
      case 'resolved':
        return 'status-resolved';
      default:
        return 'status-awaiting';
    }
  };

  const getLabel = (st: string) => {
    switch (st) {
      case 'active':
        return 'Active';
      case 'runner':
        return '🏃 Runner';
      case 'awaiting_entry':
        return 'Awaiting Entry';
      case 'invalidated':
        return 'Invalidated';
      case 'superseded':
        return 'Superseded';
      case 'resolved':
        return 'Resolved';
      default:
        return st.replace('_', ' ').toUpperCase();
    }
  };

  return (
    <div className={`status-badge ${getStatusClass(norm)}`}>
      {getLabel(norm)}
    </div>
  );
};
