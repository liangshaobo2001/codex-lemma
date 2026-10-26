import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { RightPanel } from '@/components/layout/RightPanel';
import { useLayoutStore, useWorkspaceStore } from '@/stores';
import '@/lib/i18n';
import '@/App.css';
useWorkspaceStore.setState({cwd: 'D:/git-scale-fixture'});
useLayoutStore.setState({view:'agent',isRightPanelOpen:false,activeRightPanelTab:'diff',openRightPanelTabs:['diff']});
function Fixture() {
  const [settings,setSettings]=useState(false);
  const open=useLayoutStore(s=>s.isRightPanelOpen);
  return <ThemeProvider><div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
    <nav style={{display:'flex',gap:16,height:40,flexShrink:0}}>
      <button onClick={()=>{setSettings(!settings);useLayoutStore.setState({view:settings?'agent':'settings'});}}>Settings</button>
      <button onClick={()=>useLayoutStore.setState({isRightPanelOpen:!open})}>Toggle review</button>
      <button onClick={()=>useLayoutStore.setState({activeRightPanelTab:'diff'})}>Review tab</button>
      <button onClick={()=>useLayoutStore.setState({activeRightPanelTab:'todo'})}>Other tab</button>
      <button onClick={()=>useWorkspaceStore.setState({cwd:'D:/git-scale-other'})}>Other workspace</button>
      <button onClick={()=>window.dispatchEvent(new CustomEvent('fs_change',{detail:{path:'D:/git-scale-fixture/file.txt',kind:'modify'}}))}>File refresh</button>
    </nav>
    {settings?<div data-settings>General settings</div>:<div style={{flex:1,minHeight:0,width:open?'100%':0,overflow:'hidden'}}><RightPanel/></div>}
  </div></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
