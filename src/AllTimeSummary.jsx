import React from 'react';

function AllTimeSummary({ allTransactions, heads }) {
  // Function to aggregate data by head for All-Time P&L Summary
  const getPLSummary = () => {
    const summary = {};
    allTransactions.forEach(t => {
      const headName = heads.find(h => h.id === t.headId)?.name || 'Unknown';
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
      head: headName,
      type: summary[headName].income > 0 ? 'Income' : 'Expense',
      income: summary[headName].income,
      expense: summary[headName].expense,
      net: summary[headName].income - summary[headName].expense,
    }));
  };

  const plSummary = getPLSummary();

  const totalIncome = plSummary.reduce((acc, item) => acc + item.income, 0);
  const totalExpense = plSummary.reduce((acc, item) => acc + item.expense, 0);
  const totalNet = totalIncome - totalExpense;

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold mb-4 text-gray-700">All-Time Financial Performance by P&L Head</h2>
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
              <td className="py-2 px-4 border-b">{item.head}</td>
              <td className="py-2 px-4 border-b">{item.type}</td>
              <td className="py-2 px-4 border-b text-right text-green-600">₹{item.income.toFixed(2)}</td>
              <td className="py-2 px-4 border-b text-right text-red-600">₹{item.expense.toFixed(2)}</td>
              <td className="py-2 px-4 border-b text-right font-bold" style={{ color: item.net >= 0 ? 'blue' : 'red' }}>
                ₹{item.net.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
            <tr className="bg-gray-200 font-bold">
              <td className="py-2 px-4 border-t" colSpan="2">TOTALS (All-Time)</td>
              <td className="py-2 px-4 border-t text-right text-green-600">₹{totalIncome.toFixed(2)}</td>
              <td className="py-2 px-4 border-t text-right text-red-600">₹{totalExpense.toFixed(2)}</td>
              <td className="py-2 px-4 border-t text-right" style={{ color: totalNet >= 0 ? 'blue' : 'red' }}>
                ₹{totalNet.toFixed(2)}
              </td>
            </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default AllTimeSummary;