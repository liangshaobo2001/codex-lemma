import AtlasCloudIcon from '@/assets/atlascloud.svg';
import ClaudeCodeIcon from '@/assets/claudecode-color.svg';
import CodexIcon from '@/assets/codex-color.svg';
import GeminiIcon from '@/assets/gemini-color.svg';
import GithubIcon from '@/assets/github.svg';
import MCPIcon from '@/assets/mcp.svg';
import MiniMaxIcon from '@/assets/minimax-color.svg';
import NvidiaIcon from '@/assets/nvidia-color.svg';
import OllamaIcon from '@/assets/ollama.svg';
import OpenAIIcon from '@/assets/openai.svg';
import OpenRouterIcon from '@/assets/openrouter.svg';
import { cn } from '@/lib/utils';

type IconSize = 'sm' | 'md' | 'lg';

interface BaseIconProps {
  size?: IconSize;
  className?: string;
}

interface ProviderIconsProps extends BaseIconProps {
  providerId: string;
}

const getSizeClass = (size: IconSize) => {
  switch (size) {
    case 'sm':
      return 'h-4 w-4';
    case 'md':
      return 'h-6 w-6';
    case 'lg':
      return 'h-8 w-8';
  }
};

export function ProviderIcons({ providerId, size = 'md', className = '' }: ProviderIconsProps) {
  return (
    <div className={`${getSizeClass(size)} flex items-center justify-center ${className}`.trim()}>
      {providerId === 'atlascloud' && (
        <img src={AtlasCloudIcon} alt="AtlasCloud" className="h-full w-full object-contain" />
      )}
      {providerId === 'openai' && (
        <img src={OpenAIIcon} alt="OpenAI" className="h-full w-full object-contain" />
      )}
      {providerId === 'openrouter' && (
        <img src={OpenRouterIcon} alt="OpenRouter" className="h-full w-full object-contain" />
      )}
      {providerId === 'ollama' && (
        <img src={OllamaIcon} alt="Ollama" className="h-full w-full object-contain" />
      )}
      {providerId === 'nvidia' && (
        <img src={NvidiaIcon} alt="NVIDIA" className="h-full w-full object-contain" />
      )}
      {providerId === 'minimax' && (
        <img src={MiniMaxIcon} alt="MiniMax" className="h-full w-full object-contain" />
      )}
    </div>
  );
}

export function ClaudeCode({ size = 'md', className = '' }: BaseIconProps) {
  return (
    <img src={ClaudeCodeIcon} alt="claude-code" className={cn(getSizeClass(size), className)} />
  );
}

export function Codex({ size = 'md', className = '' }: BaseIconProps) {
  return <img src={CodexIcon} alt="codex" className={cn(getSizeClass(size), className)} />;
}

/** Keke as inline SVG so its parts can animate on hover (see `.keke-svg` in App.css). */
export function Keke({ size = 'md', className = '' }: BaseIconProps) {
  return (
    <svg
      viewBox="40 30 400 470"
      role="img"
      aria-label="keke"
      className={cn('keke-svg', getSizeClass(size), className)}
    >
      <defs>
        <radialGradient id="keke-body" cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#e6dfd2" />
          <stop offset="1" stopColor="#c9c0b0" />
        </radialGradient>
      </defs>
      <g className="keke-feet">
        <ellipse cx="192" cy="455" rx="40" ry="22" fill="#7d9aa3" />
        <ellipse cx="297" cy="447" rx="40" ry="22" fill="#7d9aa3" />
      </g>
      <g className="keke-body">
        <g className="keke-antenna-l">
          <line
            x1="195"
            y1="165"
            x2="175"
            y2="80"
            stroke="#6b7f86"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle cx="174" cy="76" r="22" fill="#5f8f9c" />
        </g>
        <g className="keke-antenna-r">
          <line
            x1="285"
            y1="160"
            x2="309"
            y2="76"
            stroke="#6b7f86"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle cx="308" cy="72" r="22" fill="#e5896a" />
        </g>
        <path
          d="M205 152 L282 150 L345 205 L385 290 L372 380 L318 440 L245 462 L170 445 L112 385 L100 290 L135 205 Z"
          fill="url(#keke-body)"
          strokeLinejoin="round"
          stroke="#cfc6b6"
          strokeWidth="14"
        />
        <ellipse cx="165" cy="365" rx="20" ry="24" fill="#e6dfd2" />
        <ellipse cx="395" cy="352" rx="26" ry="32" fill="#e6dfd2" />
        <ellipse cx="362" cy="326" rx="14" ry="10" fill="#f0a5a0" />
        <line
          x1="212"
          y1="332"
          x2="172"
          y2="362"
          stroke="#2f6b78"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <circle cx="243" cy="283" r="38" fill="#f4f1ea" />
        <circle className="keke-pupil" cx="238" cy="290" r="22" fill="#2b2b33" />
        <circle className="keke-pupil" cx="231" cy="282" r="6" fill="#fff" />
        <circle cx="243" cy="283" r="45" fill="none" stroke="#2f6b78" strokeWidth="16" />
        <ellipse className="keke-eye" cx="321" cy="285" rx="15" ry="20" fill="#2b2b33" />
        <ellipse cx="295" cy="350" rx="17" ry="11" fill="#a8504a" />
      </g>
    </svg>
  );
}

export function Gemini({ size = 'md', className = '' }: BaseIconProps) {
  return <img src={GeminiIcon} alt="gemini" className={cn(getSizeClass(size), className)} />;
}

export function Github({ size = 'md', className = '' }: BaseIconProps) {
  return <img src={GithubIcon} alt="github" className={cn(getSizeClass(size), className)} />;
}

export function MCP({ size = 'md', className = '' }: BaseIconProps) {
  return <img src={MCPIcon} alt="mcp" className={cn(getSizeClass(size), className)} />;
}
