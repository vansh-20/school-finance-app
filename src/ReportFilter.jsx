import React from 'react';

// Utility to format date to YYYY-MM-DD for input default values
const formatDateForInput = (date) => {
  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
};

// =========================================================================
// NEW: Reusable P&L Summary Function
// =========================================================================
const getPLSummaryData = (transactionList, headList) => {
  const summary = {};

  // Initialize summary with all known heads
  headList.forEach(h => {
    summary[h.name] = { income: 0, expense: 0, type: h.headType };
  });

  // Process transactions
  transactionList.forEach(t => {
    const head = headList.find(h => h.id === t.headId);
    const headName = head ? head.name : 'Uncategorized'; // Handle deleted heads
    
    if (!summary[headName]) {
      summary[headName] = { income: 0, expense: 0, type: t.type }; 
    }

    if (t.type === 'income') {
      summary[headName].income += t.amount;
    } else {
      summary[headName].expense += t.amount;
    }
  });

  return Object.keys(summary).map(headName => ({
    Head: headName,
    Type: summary[headName].type,
    Income: summary[headName].income,
    Expense: summary[headName].expense,
    Net: summary[headName].income - summary[headName].expense,
  }))
  // Filter out heads that had no transactions
  .filter(item => item.Income > 0 || item.Expense > 0)
  .sort((a, b) => a.Head.localeCompare(b.Head)); // Sort alphabetically
};

// =========================================================================
// NEW: CSV Export Helper Functions
// =========================================================================

/**
 * Converts an array of objects into a CSV string.
 */
const convertArrayOfObjectsToCSV = (array) => {
  if (!array || array.length === 0) {
    return "";
  }
  
  const keys = Object.keys(array[0]);
  const csvHeader = keys.join(',') + '\n';
  
  const csvRows = array.map(row => {
    return keys.map(key => {
      let cell = row[key] === null || row[key] === undefined ? '' : row[key];
      cell = cell.toString().replace(/"/g, '""'); // Escape double quotes
      if (cell.search(/("|,|\n)/g) >= 0) {
        cell = `"${cell}"`; // Enclose in double quotes
      }
      return cell;
    }).join(',');
  }).join('\n');
  
  return csvHeader + csvRows;
};

/**
 * Triggers a browser download for the given CSV string.
 */
const downloadCSV = (data, filename) => {
  const csvString = convertArrayOfObjectsToCSV(data);
  if (!csvString) {
      alert("No data to export.");
      return;
  }
  
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
      alert("Your browser does not support automatic CSV downloads.");
  }
};


// =========================================================================
// Main Component
// =========================================================================
function ReportFilter({ 
  startDate, 
  endDate, 
  setStartDate, 
  setEndDate, 
  transactions, // This is the FILTERED list
  heads, 
  allTransactions // This is the FULL list
}) {
  
  // Calculate totals for the filtered P&L table display
  const plSummary = getPLSummaryData(transactions, heads);
  
  const totalNet = plSummary.reduce((acc, item) => acc + item.Net, 0);
  const totalIncomeCalc = plSummary.reduce((acc, item) => acc + item.Income, 0);
  const totalExpenseCalc = plSummary.reduce((acc, item) => acc + item.Expense, 0);


  // UPDATED: Export function
  const handleExport = (reportType) => {
    let dataToExport = [];
    let filename = 'report.csv';
    const formattedStartDate = formatDateForInput(startDate);
    const formattedEndDate = formatDateForInput(endDate);

    switch (reportType) {
      case "Filtered Transactions List":
        dataToExport = transactions
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .map(t => {
            const head = heads.find((h) => h.id === t.headId);
            return {
              Date: t.date,
              Type: t.type,
              Head: head ? head.name : "Unknown",
              Description: t.description || "",
              Amount: t.amount,
              ReceiptURL: t.receiptUrl || ""
            };
          });
        filename = `Transactions_${formattedStartDate}_to_${formattedEndDate}.csv`;
        break;

      case "Filtered P&L Head Summary":
        dataToExport = plSummary;
        filename = `PL_Summary_${formattedStartDate}_to_${formattedEndDate}.csv`;
        break;

      case "All-Time P&L Head Summary":
        // Use the 'allTransactions' prop here
        dataToExport = getPLSummaryData(allTransactions, heads); 
        filename = 'PL_Summary_All_Time.csv';
        break;
      
      default:
        alert("Unknown report type.");
        return;
    }
    
    downloadCSV(dataToExport, filename);
  };

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold mb-4 text-gray-700">Reporting & Exports</h2>

      {/* Select Report Period UI */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-blue-700 mb-2">Select Report Period</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">Start Date</label>
            <input
              type="date"
              value={formatDateForInput(startDate)}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 p-2 rounded w-full"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">End Date</label>
            <input
              type="date"
              value={formatDateForInput(endDate)}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 p-2 rounded w-full"
            />
          </div>
        </div>
      </div>

      <p className="text-sm mb-4 text-gray-600">
        Current Report Period: {formatDateForInput(startDate)} to {formatDateForInput(endDate)}
      </p>

      {/* Export Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleExport("Filtered Transactions List")}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Filtered Transactions List
        </button>
        <button
          onClick={() => handleExport("Filtered P&L Head Summary")}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Filtered P&L Head Summary
        </button>
        <button
          onClick={() => handleExport("All-Time P&L Head Summary")}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition"
        >
          All-Time P&L Head Summary
        </button>
      </div>

      {/* P&L Head Summary Dashboard (Filtered) */}
      <div className="mt-8 overflow-x-auto">
        <h3 className="text-xl font-semibold mb-3">P&L Head Summary (Filtered: {formatDateForInput(startDate)} to {formatDateForInput(endDate)})</h3>
        <table className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-4 border-b text-left">Head</th>
              <th className="py-2 px-4 border-b text-left">Type</th>
              <th className="py-2 px-4 border-b text-right text-green-600">Income (₹)</th>
              <th className="py-2 px-4 border-b text-right text-red-600">Expense (₹)</th>
              <th className="py-2 px-4 border-b text-right text-blue-600">Net (₹)</th>
            </tr>
          </thead>
          <tbody>
            {plSummary.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="py-2 px-4 border-b">{item.Head}</td>
                <td className="py-2 px-4 border-b">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.Type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {item.Type}
                  </span>
                </td>
                <td className="py-2 px-4 border-b text-right text-green-600">₹{item.Income.toFixed(2)}</td>
                <td className="py-2 px-4 border-b text-right text-red-600">₹{item.Expense.toFixed(2)}</td>
                <td className="py-2 px-4 border-b text-right font-bold" style={{ color: item.Net >= 0 ? '#059669' : '#DC2626' }}>
                  ₹{item.Net.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-200 font-bold">
              <td className="py-2 px-4 border-t" colSpan="2">TOTALS</td>
              <td className="py-2 px-4 border-t text-right text-green-600">₹{totalIncomeCalc.toFixed(2)}</td>
              <td className="py-2 px-border-t text-right text-red-600">₹{totalExpenseCalc.toFixed(2)}</td>
              <td className="py-2 px-4 border-t text-right" style={{ color: totalNet >= 0 ? '#059669' : '#DC2626' }}>
                ₹{totalNet.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

       {/* Recent Transactions List (Filtered) */}
       <div className="mt-8 overflow-x-auto">
        <h3 className="text-xl font-semibold mb-3">Filtered Transactions ({transactions.length})</h3>
        <table className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-4 border-b text-left">Date</th>
              <th className="py-2 px-4 border-b text-left">Head</th>
              <th className="py-2 px-4 border-b text-left">Description</th>
              <th className="py-2 px-4 border-b text-left">Receipt</th>
              <th className="py-2 px-4 border-b text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).map((t) => {
              const head = heads.find((h) => h.id === t.headId);
              return (
                <tr key={t.id} className="hover:bg-gray-50 text-sm">
                  <td className="py-2 px-4 border-b">{new Date(t.date).toLocaleDateString()}</td>
                  <td className="py-2 px-4 border-b">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {head?.name || "Unknown"}
                    </span>
                  </td>
                  <td className="py-2 px-4 border-b">{t.description || 'N/A'}</td>
                  <td className="py-2 px-4 border-b">
                    {t.receiptUrl ? <a href={t.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">View</a> : 'N/A'}
                  </td>
                  <td className={`py-2 px-4 border-b text-right font-semibold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'income' ? '' : '-'}₹{t.amount.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ReportFilter;