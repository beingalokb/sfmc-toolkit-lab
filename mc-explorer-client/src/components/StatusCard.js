import React from 'react';

const StatusCard = ({ title, count, breakdown, color = 'primary' }) => {
  return (
    <div className="status-card">
      <div className="status-card-title">
        {title}
      </div>
      <div className="status-card-value">
        {count.toLocaleString()}
      </div>
      {breakdown && (
        <div className="status-card-breakdown">
          <div className="status-card-breakdown-item">
            <span>Last 7d:</span>
            <span className="font-semibold">{breakdown.last7}</span>
          </div>
          <div className="status-card-breakdown-item">
            <span>Last 30d:</span>
            <span className="font-semibold">{breakdown.last30}</span>
          </div>
          <div className="status-card-breakdown-item">
            <span>Last 6mo:</span>
            <span className="font-semibold">{breakdown.last180}</span>
          </div>
          <div className="status-card-breakdown-item">
            <span>Last 1yr:</span>
            <span className="font-semibold">{breakdown.last365}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusCard;
