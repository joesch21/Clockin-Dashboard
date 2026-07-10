import React, { useState } from 'react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import { Plus, Upload, Download, Edit2, Trash2, Search, X } from 'lucide-react';
import { useAppContext } from '../App';

function WalletMapping() {
  const { mappings, updateMappings, showNotification } = useAppContext();
  
  const [walletInput, setWalletInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [isEditing, setIsEditing] = useState(null);
  const [editWallet, setEditWallet] = useState("");
  const [editName, setEditName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredMappings = mappings.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.wallet.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddMapping = (e) => {
    e.preventDefault();
    if (!walletInput.trim() || !nameInput.trim()) {
      showNotification("Both wallet address and employee name are required!", "warning");
      return;
    }
    
    // Check for duplicate wallet
    if (mappings.some(m => m.wallet.toLowerCase() === walletInput.trim().toLowerCase())) {
      showNotification("This wallet address is already mapped!", "warning");
      return;
    }

    const newMapping = { 
      wallet: walletInput.trim(), 
      name: nameInput.trim() 
    };
    
    const updated = [...mappings, newMapping];
    updateMappings(updated);
    showNotification(`Added mapping for ${nameInput.trim()}`, "success");
    
    setWalletInput("");
    setNameInput("");
    setShowAddModal(false);
  };

  const startEdit = (index) => {
    const mapping = mappings[index];
    setIsEditing(index);
    setEditWallet(mapping.wallet);
    setEditName(mapping.name);
  };

  const saveEdit = (index) => {
    if (!editName.trim() || !editWallet.trim()) {
      showNotification("Name and wallet cannot be empty", "warning");
      return;
    }

    const updated = [...mappings];
    updated[index] = { wallet: editWallet.trim(), name: editName.trim() };
    updateMappings(updated);
    setIsEditing(null);
    showNotification("Mapping updated successfully", "success");
  };

  const cancelEdit = () => {
    setIsEditing(null);
    setEditWallet("");
    setEditName("");
  };

  const deleteMapping = (index) => {
    if (!confirm("Delete this employee mapping?")) return;
    const updated = mappings.filter((_, i) => i !== index);
    updateMappings(updated);
    showNotification("Mapping deleted", "success");
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const uploaded = result.data
          .filter(row => row.wallet && row.name)
          .map(row => ({
            wallet: row.wallet.trim(),
            name: row.name.trim()
          }));

        if (uploaded.length === 0) {
          showNotification("No valid mappings found in CSV. Need 'wallet' and 'name' columns.", "warning");
          return;
        }

        // Merge strategy: replace duplicates by wallet, add new
        const walletSet = new Set(mappings.map(m => m.wallet.toLowerCase()));
        const merged = [...mappings];
        
        uploaded.forEach(u => {
          const existingIdx = merged.findIndex(m => m.wallet.toLowerCase() === u.wallet.toLowerCase());
          if (existingIdx !== -1) {
            merged[existingIdx] = u; // update name
          } else {
            merged.push(u);
          }
        });

        updateMappings(merged);
        showNotification(`Imported ${uploaded.length} mappings successfully!`, "success");
        e.target.value = ''; // reset input
      },
      error: () => {
        showNotification("Failed to parse CSV file", "warning");
      }
    });
  };

  const handleDownloadCSV = () => {
    if (mappings.length === 0) {
      showNotification("No mappings to export", "warning");
      return;
    }
    const csv = Papa.unparse(mappings);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `employee_wallet_mappings_${new Date().toISOString().slice(0,10)}.csv`);
    showNotification(`Exported ${mappings.length} mappings`, "success");
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Employee Wallet Mappings</h1>
          <p className="text-gray-500 mt-1">Link blockchain wallet addresses to real employee names for readable reports.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="btn btn-secondary cursor-pointer text-sm">
            <Upload className="w-4 h-4" /> Import CSV
            <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
          </label>
          <button onClick={handleDownloadCSV} className="btn btn-secondary text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary text-sm">
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 relative max-w-md">
        <Search className="w-4 h-4 absolute left-4 top-3.5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or wallet address..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input pl-11 py-2.5 text-sm"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm("")} className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mappings Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left px-6 py-4 font-medium text-sm">Employee Name</th>
              <th className="text-left px-6 py-4 font-medium text-sm">Wallet Address</th>
              <th className="text-right px-6 py-4 font-medium text-sm w-40">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredMappings.length > 0 ? (
              filteredMappings.map((mapping, index) => {
                const originalIndex = mappings.findIndex(m => m.wallet === mapping.wallet);
                const isCurrentlyEditing = isEditing === originalIndex;

                return (
                  <tr key={originalIndex} className="log-row">
                    <td className="px-6 py-4">
                      {isCurrentlyEditing ? (
                        <input 
                          type="text" 
                          value={editName} 
                          onChange={(e) => setEditName(e.target.value)}
                          className="input py-1.5 text-sm" 
                        />
                      ) : (
                        <span className="font-medium text-gray-900">{mapping.name}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-gray-600 break-all">
                      {isCurrentlyEditing ? (
                        <input 
                          type="text" 
                          value={editWallet} 
                          onChange={(e) => setEditWallet(e.target.value)}
                          className="input py-1.5 text-sm font-mono" 
                        />
                      ) : (
                        mapping.wallet
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isCurrentlyEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(originalIndex)} className="btn btn-success text-xs px-4 py-1.5">Save</button>
                          <button onClick={cancelEdit} className="btn btn-secondary text-xs px-4 py-1.5">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1.5">
                          <button 
                            onClick={() => startEdit(originalIndex)} 
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteMapping(originalIndex)} 
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-gray-400">
                  {searchTerm ? "No matches found for your search." : "No employee mappings yet. Add your first one above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-gray-400 px-1">
        Mappings are saved in your browser's local storage. Import a CSV with columns: <span className="font-mono">wallet,name</span>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-semibold">Add New Employee Mapping</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
            </div>
            
            <form onSubmit={handleAddMapping} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Employee Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Chen"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Wallet Address (0x...)</label>
                <input
                  type="text"
                  placeholder="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  className="input font-mono text-sm"
                  required
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn btn-primary flex-1">Add Mapping</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default WalletMapping;
