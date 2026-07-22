
import React, { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import DraftRoom from './components/Contests';
import Lobby from './components/Lobby';
import Architecture from './components/Architecture';
import Intelligence from './components/Intelligence';
import NeuralStudio from './components/NeuralStudio';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home'); 

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Dashboard setActiveTab={setActiveTab} />;
      case 'lobby':
        return <Lobby setActiveTab={setActiveTab} />;
      case 'war-room':
        return <DraftRoom setActiveTab={setActiveTab} />;
      case 'intelligence':
        return <Intelligence />;
      case 'neural':
        return <NeuralStudio />;
      case 'architecture':
        return <Architecture />;
      default:
        return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <ErrorBoundary>
      <Layout 
        activeTab={
          activeTab === 'home' ? 'daily' : 
          activeTab === 'lobby' ? 'weekly' : 
          activeTab === 'war-room' ? 'comms' :
          activeTab === 'intelligence' ? 'crypto' :
          activeTab === 'neural' ? 'neural' :
          activeTab === 'architecture' ? 'architecture' : 'daily'
        } 
        setActiveTab={(tab) => {
          if (tab === 'daily') setActiveTab('home');
          if (tab === 'weekly') setActiveTab('lobby');
          if (tab === 'comms') setActiveTab('war-room');
          if (tab === 'crypto') setActiveTab('intelligence');
          if (tab === 'neural') setActiveTab('neural');
          if (tab === 'architecture') setActiveTab('architecture');
        }}
      >
        {renderContent()}
      </Layout>
    </ErrorBoundary>
  );
};

export default App;
