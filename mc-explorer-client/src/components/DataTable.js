import React from 'react';

const DataTable = ({ 
  title,
  data, 
  columns, 
  loading = false, 
  emptyMessage = "No data available",
  actions,
  onRowClick,
  pagination
}) => {
  if (loading) {
    return (
      <div className="table-container">
        <div className="flex items-center justify-center py-16">
          <div className="loading mr-3"></div>
          <span className="text-gray-600">Loading data...</span>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="table-container">
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h3>No Data Available</h3>
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      {(title || actions) && (
        <div className="table-header">
          {title && <h3 className="table-title">{title}</h3>}
          {actions && <div className="table-actions">{actions}</div>}
        </div>
      )}
      
      <table>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} style={column.width ? { width: column.width } : {}}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr 
              key={rowIndex}
              onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
              className={onRowClick ? 'cursor-pointer' : ''}
            >
              {columns.map((column, colIndex) => (
                <td key={colIndex}>
                  {column.render ? column.render(row, rowIndex) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      
      {pagination && (
        <div className="flex justify-between items-center p-4 border-t border-gray-200">
          {pagination}
        </div>
      )}
    </div>
  );
};

export default DataTable;
