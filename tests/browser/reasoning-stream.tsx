import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Reasoning } from '@/components/ai-elements/Reasoning';
import { Trace } from '@/components/ui/trace';
import '@/App.css';

function Fixture() {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  return <main style={{ padding: 16 }}>
    <nav className="flex gap-4 mb-4">
      <button onClick={() => setText(previous => previous + 'Another streamed reasoning line.\n'.repeat(10) + 'LATEST_TOKEN')}>Delta</button>
      <button onClick={() => setDone(true)}>Next step</button>
    </nav>
    <Trace>
      <Reasoning title={done ? 'Thought for 3s' : 'Thinking'} text={text} running={!done} />
      {done && <Reasoning title="Thinking" text="Next step streaming" running />}
    </Trace>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
