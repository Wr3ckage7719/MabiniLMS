import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          MabiniLMS
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Learning Management System
        </p>
        <div className="space-y-4">
          <button
            onClick={() => setCount((count) => count + 1)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Count is {count}
          </button>
          <p className="text-sm text-gray-500">
            Edit <code className="bg-gray-200 px-2 py-1 rounded">src/App.tsx</code> and save to test HMR
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
