import React from 'react';
import { CheckCircle2, Clock, AlertCircle, RefreshCw } from 'lucide-react';

export default function StatusBadge({ status }) {
  const norm = (status || 'pending').toLowerCase();

  if (norm === 'completed' || norm === 'passed') {
    return (
      <span className="badge badge-success">
        <CheckCircle2 size={12} /> Completed
      </span>
    );
  }

  if (norm === 'running' || norm === 'processing') {
    return (
      <span className="badge badge-cyan">
        <RefreshCw size={12} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} /> Processing
      </span>
    );
  }

  if (norm === 'failed') {
    return (
      <span className="badge badge-danger">
        <AlertCircle size={12} /> Failed
      </span>
    );
  }

  if (norm === 'warning') {
    return (
      <span className="badge badge-warning">
        <AlertCircle size={12} /> Warning
      </span>
    );
  }

  if (norm === 'resumed') {
    return (
      <span className="badge badge-purple">
        <RefreshCw size={12} /> Resumed
      </span>
    );
  }

  return (
    <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
      <Clock size={12} /> {status || 'Pending'}
    </span>
  );
}
