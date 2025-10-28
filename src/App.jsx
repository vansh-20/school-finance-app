import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc, // Make sure updateDoc is imported
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./index.css";

// =========================================================================
// HELPER FUNCTIONS (Moved from other files)
// =========================================================================

// Utility to get today's date in YYYY-MM-DD format
const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

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

/**
 * Reusable function to calculate P&L summaries
 */
const getPLSummaryData = (transactionList, headList) => {
  const summary = {};
  headList.forEach(h => {
    summary[h.name] = { income: 0, expense: 0, type: h.headType };
  });

  transactionList.forEach(t => {
    const head = headList.find(h => h.id === t.headId);
    const headName = head ? head.name : 'Uncategorized'; 
    
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
  .filter(item => item.Income > 0 || item.Expense > 0)
  .sort((a, b) => a.Head.localeCompare(b.Head));
};

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
      cell = cell.toString().replace(/"/g, '""'); 
      if (cell.search(/("|,|\n)/g) >= 0) {
        cell = `"${cell}"`; 
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
// MAIN APP COMPONENT
// =========================================================================
function App() {
  const [user, setUser] = useState(null);
  const [heads, setHeads] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // State for date filtering
  const [startDate, setStartDate] = useState(getTodayDate);
  const [endDate, setEndDate] = useState(getTodayDate);


  // ===== AUTH LISTENER =====
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ===== FIRESTORE LISTENERS =====
  useEffect(() => {
    if (!user) return;

    // Heads Listener
    const qHeads = query(collection(db, `users/${user.uid}/heads`));
    const unsubHeads = onSnapshot(qHeads, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setHeads(data);
    });

    // Transactions Listener
    const qTrans = query(collection(db, `users/${user.uid}/transactions`));
    const unsubTrans = onSnapshot(qTrans, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAllTransactions(data); 
      
      // Initialize date range
      if (data.length > 0 && startDate === getTodayDate()) {
        const validData = data.filter(t => t.date && !isNaN(new Date(t.date)));
        if (validData.length > 0) {
            const sortedData = validData.sort((a, b) => new Date(a.date) - new Date(b.date));
            const firstDate = new Date(sortedData[0].date); 
            const lastDate = new Date(); 
            const initialStartDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1).toISOString().split('T')[0];
            setStartDate(initialStartDate);
            setEndDate(lastDate.toISOString().split('T')[0]);
        }
      }
    });

    return () => {
      unsubHeads();
      unsubTrans();
    };
  }, [user, startDate]); // Added startDate to satisfy exhaustive-deps

  // ===== FIRESTORE OPERATIONS =====
  const addHead = async (name, headType) => {
    if (!user || !name) return;
    await addDoc(collection(db, `users/${user.uid}/heads`), { name, headType });
  };

  const deleteHead = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, `users/${user.uid}/heads/${id}`));
  };

  const addTransaction = async (amount, type, headId, date, description = "", receiptUrl = "") => {
    if (!user || !amount || !headId || !date) return;
    await addDoc(collection(db, `users/${user.uid}/transactions`), {
      amount: parseFloat(amount),
      type,
      headId,
      date, 
      description,
      receiptUrl,
      createdAt: new Date().toISOString(), 
    });
  };

  // NEW: Delete and Update Transaction functions
  const deleteTransaction = async (id) => {
    if (!user || !id) return;
    if (!window.confirm("Are you sure you want to delete this transaction?")) {
      return; 
    }
    try {
      await deleteDoc(doc(db, `users/${user.uid}/transactions/${id}`));
    } catch (error) {
      console.error("Error deleting transaction: ", error);
      alert("Failed to delete transaction.");
    }
  };
  // ... (inside function App())

  const updateTransactionAmount = async (id, newAmountString) => {
    if (!user || !id) return;
    
    const newAmount = parseFloat(newAmountString);
    
    // Validate the new amount
    if (isNaN(newAmount) || newAmount <= 0) {
      alert("Please enter a valid, positive amount.");
      return; // Stop if the amount is not a valid number
    }

    const transDocRef = doc(db, `users/${user.uid}/transactions/${id}`);
    try {
      await updateDoc(transDocRef, {
        amount: newAmount // Save the parsed number
      });
    } catch (error) {
      console.error("Error updating amount: ", error);
      alert("Failed to update amount.");
    }
  };

  const updateTransactionDescription = async (id, newDescription) => {
    if (!user || !id) return;
    const transDocRef = doc(db, `users/${user.uid}/transactions/${id}`);
    try {
      await updateDoc(transDocRef, {
        description: newDescription
      });
    } catch (error) {
      console.error("Error updating description: ", error);
      alert("Failed to update description.");
    }
  };

  // ===== AUTH ACTIONS =====
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // ===== DATA FILTERING AND COMPUTATION =====
  
  // 1. Filter Transactions based on the Date Range
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setDate(end.getDate() + 1); 

  const filteredTransactions = allTransactions.filter(t => {
    const tDate = new Date(t.date);
    return t.date && !isNaN(tDate) && tDate >= start && tDate < end; 
  });


  // 2. Compute Totals for the top Summary Cards
  const totalIncome = filteredTransactions
    .filter((t) => t.type === "income")
    .reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = filteredTransactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => acc + t.amount, 0);
  const balance = totalIncome - totalExpense;


  // =========================================================================
  // LOGIC MOVED FROM ReportFilter.jsx and AllTimeSummary.jsx
  // =========================================================================

  // 1. Calculate P&L Summary for FILTERED data
  const filteredPlSummary = getPLSummaryData(filteredTransactions, heads);
  const filteredTotalNet = filteredPlSummary.reduce((acc, item) => acc + item.Net, 0);
  const filteredTotalIncome = filteredPlSummary.reduce((acc, item) => acc + item.Income, 0);
  const filteredTotalExpense = filteredPlSummary.reduce((acc, item) => acc + item.Expense, 0);

  // 2. Calculate P&L Summary for ALL-TIME data
  const allTimePlSummary = getPLSummaryData(allTransactions, heads);
  const allTimeTotalIncome = allTimePlSummary.reduce((acc, item) => acc + item.Income, 0);
  const allTimeTotalExpense = allTimePlSummary.reduce((acc, item) => acc + item.Expense, 0);
  const allTimeTotalNet = allTimeTotalIncome - allTimeTotalExpense;

  // 3. Edit Handler (for transaction description)
  const handleEditDescription = (id, currentDescription) => {
    const newDescription = window.prompt("Enter new description:", currentDescription);
    if (newDescription !== null && newDescription !== currentDescription) {
      updateTransactionDescription(id, newDescription);
    }
  };
  // (This goes near your other handlers like handleEditDescription)
  const handleEditAmount = (id, currentAmount) => {
    const newAmountString = window.prompt("Enter new amount:", currentAmount);
    
    // Check if user clicked OK and the value is different
    if (newAmountString !== null && newAmountString !== String(currentAmount)) {
      updateTransactionAmount(id, newAmountString);
    }
  };

  // 4. Export Handler
  const handleExport = (reportType) => {
    let dataToExport = [];
    let filename = 'report.csv';
    const formattedStartDate = formatDateForInput(startDate);
    const formattedEndDate = formatDateForInput(endDate);

    switch (reportType) {
      case "Filtered Transactions List": { // <-- Added brace
        dataToExport = filteredTransactions
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
      } // <-- Added brace

      case "Filtered P&L Head Summary": { // <-- Added brace
        // Get totals for the filtered data
        const totalIncomeF = filteredPlSummary.reduce((acc, item) => acc + item.Income, 0);
        const totalExpenseF = filteredPlSummary.reduce((acc, item) => acc + item.Expense, 0);
        const totalNetF = totalIncomeF - totalExpenseF;
        const totalsRowF = { Head: "TOTALS", Type: "", Income: totalIncomeF, Expense: totalExpenseF, Net: totalNetF };
        
        dataToExport = [...filteredPlSummary, totalsRowF]; 
        filename = `PL_Summary_${formattedStartDate}_to_${formattedEndDate}.csv`;
        break;
      } // <-- Added brace

      case "All-Time P&L Head Summary": { // <-- Added brace
        const allTimeSummary = getPLSummaryData(allTransactions, heads);
        // Get totals for all-time data
        const totalIncomeA = allTimeSummary.reduce((acc, item) => acc + item.Income, 0);
        const totalExpenseA = allTimeSummary.reduce((acc, item) => acc + item.Expense, 0);
        const totalNetA = totalIncomeA - totalExpenseA;
        const totalsRowA = { Head: "TOTALS", Type: "", Income: totalIncomeA, Expense: totalExpenseA, Net: totalNetA };

        dataToExport = [...allTimeSummary, totalsRowA];
        filename = 'PL_Summary_All_Time.csv';
        break;
      } // <-- Added brace
      
      default:
        alert("Unknown report type.");
        return;
    }
    downloadCSV(dataToExport, filename);
  };

  // ===== UI RENDER (Loading and Login) =====
  if (loading)
    return <div className="flex items-center justify-center h-screen">Loading...</div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-3xl font-bold mb-4">Expense Tracker</h1>
        <button
          onClick={handleLogin}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  // ===== MAIN APP RENDER =====
  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h1 className="text-2xl font-semibold text-gray-800">Welcome, {user.displayName}</h1>
        <button
          onClick={handleLogout}
          className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition"
        >
          Logout
        </button>
      </div>

      {/* Summary (Uses FILTERED totals) */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white shadow-md rounded-lg p-4 text-center">
          <h2 className="text-sm font-medium text-gray-500">Income (Filtered)</h2>
          <p className="text-green-600 font-bold text-2xl">₹{totalIncome.toFixed(2)}</p>
        </div>
        <div className="bg-white shadow-md rounded-lg p-4 text-center">
          <h2 className="text-sm font-medium text-gray-500">Expense (Filtered)</h2>
          <p className="text-red-600 font-bold text-2xl">₹{totalExpense.toFixed(2)}</p>
        </div>
        <div className="bg-white shadow-md rounded-lg p-4 text-center">
          <h2 className="text-sm font-medium text-gray-500">Balance (Filtered)</h2>
          <p className="text-blue-600 font-bold text-2xl">₹{balance.toFixed(2)}</p>
        </div>
      </div>

      {/* Heads Section */}
      <div className="bg-white shadow-lg rounded-lg p-4 mb-6">
        <h2 className="text-xl font-semibold mb-3 text-gray-700">Manage P&L Heads</h2>
        <HeadManager heads={heads} addHead={addHead} deleteHead={deleteHead} />
      </div>

      {/* Transactions Recording Section */}
      <div className="bg-white shadow-lg rounded-lg p-4 mb-6">
        <h2 className="text-xl font-semibold mb-3 text-gray-700">Record New Transaction</h2>
        <TransactionManager
          heads={heads}
          addTransaction={addTransaction}
        />
      </div>

      {/* ===================================================================
          REPORTING SECTION (MOVED FROM ReportFilter.jsx)
          =================================================================== */}
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
              {filteredPlSummary.map((item, index) => (
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
                <td className="py-2 px-4 border-t text-right text-green-600">₹{filteredTotalIncome.toFixed(2)}</td>
                <td className="py-2 px-4 border-t text-right text-red-600">₹{filteredTotalExpense.toFixed(2)}</td>
                <td className="py-2 px-4 border-t text-right" style={{ color: filteredTotalNet >= 0 ? '#059669' : '#DC2626' }}>
                  ₹{filteredTotalNet.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Filtered Transactions List */}
        <div className="mt-8 overflow-x-auto">
          <h3 className="text-xl font-semibold mb-3">Filtered Transactions ({filteredTransactions.length})</h3>
          <table className="min-w-full bg-white border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-4 border-b text-left">Date</th>
                <th className="py-2 px-4 border-b text-left">Head</th>
                <th className="py-2 px-4 border-b text-left">Description</th>
                <th className="py-2 px-4 border-b text-left">Receipt</th>
                <th className="py-2 px-4 border-b text-right">Amount (₹)</th>
                <th className="py-2 px-4 border-b text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date)).map((t) => {
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
                   {/* ... inside the <tbody> .map((t) => { ... */}
                  <td className="py-2 px-4 border-b text-right space-x-2">
                    <button
                      onClick={() => handleEditDescription(t.id, t.description)}
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-200"
                    >
                      Edit Desc
                    </button>
                    {/* NEW BUTTON */}
                    <button
                      onClick={() => handleEditAmount(t.id, t.amount)}
                      className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full hover:bg-yellow-200"
                    >
                      Edit Amt
                    </button>
                    <button
                      onClick={() => deleteTransaction(t.id)}
                      className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </td>
                  {/* ... */}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* ===================================================================
          ALL-TIME SUMMARY SECTION (MOVED FROM AllTimeSummary.jsx)
          =================================================================== */}
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
            {allTimePlSummary.map((item, index) => (
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
                <td className="py-2 px-4 border-t" colSpan="2">TOTALS (All-Time)</td>
                <td className="py-2 px-4 border-t text-right text-green-600">₹{allTimeTotalIncome.toFixed(2)}</td>
                <td className="py-2 px-4 border-t text-right text-red-600">₹{allTimeTotalExpense.toFixed(2)}</td>
                <td className="py-2 px-4 border-t text-right" style={{ color: allTimeTotalNet >= 0 ? '#059669' : '#DC2626' }}>
                  ₹{allTimeTotalNet.toFixed(2)}
                </td>
              </tr>
          </tfoot>
        </table>
      </div>

    </div> // End of main app div
  );
}

// =========================================================================
// HEAD MANAGER COMPONENT (Sub-component, stays in App.jsx)
// =========================================================================
function HeadManager({ heads, addHead, deleteHead }) {
  const [newHead, setNewHead] = useState("");
  const [headType, setHeadType] = useState("expense"); 

  const filteredHeads = heads.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      {/* Type Selector */}
      <div className="flex gap-4 mb-2 text-sm text-gray-700">
        <label className="flex items-center">
          <input
            type="radio"
            name="headType"
            value="income"
            checked={headType === "income"}
            onChange={() => setHeadType("income")}
            className="mr-1 accent-green-500"
          />
          Income Head
        </label>
        <label className="flex items-center">
          <input
            type="radio"
            name="headType"
            value="expense"
            checked={headType === "expense"}
            onChange={() => setHeadType("expense")}
            className="mr-1 accent-red-500"
          />
          Expense Head
        </label>
      </div>
      
      <div className="flex mb-4">
        <input
          type="text"
          placeholder="Enter new head name"
          value={newHead}
          onChange={(e) => setNewHead(e.target.value)}
          className="flex-1 border border-gray-300 rounded-l-lg p-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={() => {
            if (newHead.trim()) {
                addHead(newHead.trim(), headType); 
                setNewHead("");
                setHeadType("expense"); 
            }
          }}
          className="bg-blue-600 text-white px-4 rounded-r-lg hover:bg-blue-700 transition"
        >
          Add
        </button>
      </div>
      
      <div className="max-h-60 overflow-y-auto">
        <ul className="divide-y divide-gray-200">
            {filteredHeads.map((h) => (
            <li key={h.id} className="flex justify-between items-center py-2 px-1 hover:bg-gray-50 transition">
                <span className={`font-medium ${(h.headType || 'expense') === 'income' ? 'text-green-700' : 'text-red-700'}`}>
                    {h.name} 
                    <span className="text-xs ml-2 px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: (h.headType || 'expense') === 'income' ? '#d1e7dd' : '#f8d7da', 
                                  color: (h.headType || 'expense') === 'income' ? '#0f5132' : '#842029' }}>
                        {(h.headType || 'UNCATEGORIZED').toUpperCase()}
                    </span>
                </span>
                <button
                onClick={() => deleteHead(h.id)}
                className="text-sm bg-red-100 text-red-600 px-3 py-1 rounded-full hover:bg-red-200"
                >
                Delete
                </button>
            </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

// =========================================================================
// TRANSACTIONS COMPONENT (Sub-component, stays in App.jsx)
// =========================================================================
function TransactionManager({ heads, addTransaction }) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense"); 
  const [headId, setHeadId] = useState("");
  const [date, setDate] = useState(getTodayDate);
  const [description, setDescription] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");

  const filteredHeads = heads
    .filter(h => h.headType === type)
    .sort((a, b) => a.name.localeCompare(b.name));


  const handleSubmit = () => {
    if (!amount || !headId || !date) {
        alert("Please fill out Amount, Head, and Date.");
        return;
    }
    
    addTransaction(amount, type, headId, date, description, receiptUrl);
    setAmount("");
    setHeadId("");
    setDescription("");
    setReceiptUrl("");
  };

  return (
    <div>
      {/* Input Fields */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-300 p-2 rounded"
        />
        <input
          type="number"
          placeholder="Amount (₹)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border border-gray-300 p-2 rounded"
        />
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setHeadId(""); 
          }}
          className="border border-gray-300 p-2 rounded"
        >
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select
          value={headId}
          onChange={(e) => setHeadId(e.target.value)}
          className="border border-gray-300 p-2 rounded"
        >
          <option value="">Select Head ({type})</option>
          {filteredHeads.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <input
          type="text"
          placeholder="Description (e.g., Electricity bill)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border border-gray-300 p-2 rounded col-span-2"
        />
        <input
          type="url"
          placeholder="Optional: Receipt Image URL"
          value={receiptUrl}
          onChange={(e) => setReceiptUrl(e.target.value)}
          className="border border-gray-300 p-2 rounded"
        />
      </div>

      {/* Add Button */}
      <button
        onClick={handleSubmit}
        className={`w-full text-white font-semibold rounded p-2 transition ${
            type === 'income' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
        }`}
      >
        Record {type === 'income' ? 'Income' : 'Expense'}
      </button>

    </div>
  );
}

export default App;
