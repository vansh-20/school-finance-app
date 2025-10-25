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
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./index.css";

// Import new components
import ReportFilter from './ReportFilter'; 
import AllTimeSummary from './AllTimeSummary';

// Utility to get today's date in YYYY-MM-DD format
const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
};

function App() {
  const [user, setUser] = useState(null);
  const [heads, setHeads] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // New state for date filtering
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

  // ===== FIRESTORE LISTENERS (Pulls all transactions and heads) =====
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
      
      // Initialize date range to cover the first month of data
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
  }, [user, startDate]); 

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
  end.setDate(end.getDate() + 1); // Include the end date fully

  const filteredTransactions = allTransactions.filter(t => {
    const tDate = new Date(t.date);
    return t.date && !isNaN(tDate) && tDate >= start && tDate < end; 
  });


  // 2. Compute Totals using filtered transactions
  const totalIncome = filteredTransactions
    .filter((t) => t.type === "income")
    .reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = filteredTransactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => acc + t.amount, 0);
  const balance = totalIncome - totalExpense;


  // ===== UI RENDER =====
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
        FIX: These are now UN-COMMENTED and will render
        ===================================================================
      */}
      
      <ReportFilter
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        transactions={filteredTransactions} // Pass the FILTERED data
        heads={heads}
        allTransactions={allTransactions}
      />

      <AllTimeSummary 
        allTransactions={allTransactions} // Pass ALL data
        heads={heads} 
      />

    </div>
  );
}

// =========================================================================
// HEAD MANAGER
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
// TRANSACTIONS COMPONENT
// =========================================================================
function TransactionManager({ heads, addTransaction }) {
  const [amount, setAmount] =useState("");
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
        {/* Date Input */}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-300 p-2 rounded"
        />
        {/* Amount Input */}
        <input
          type="number"
          placeholder="Amount (₹)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border border-gray-300 p-2 rounded"
        />
        {/* Type Select */}
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setHeadId(""); // Reset head selection when type changes
          }}
          className="border border-gray-300 p-2 rounded"
        >
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        {/* Head Select - Now filtered */}
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
        {/* Description Input */}
        <input
          type="text"
          placeholder="Description (e.g., Electricity bill)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border border-gray-300 p-2 rounded col-span-2"
        />
        {/* Receipt URL Input */}
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