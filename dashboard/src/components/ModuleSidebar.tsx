/**
 * Module Sidebar — toggleable detection modules (§3.1 left sidebar).
 */
import { MODULE_INFO, type ModuleName } from '../types';

interface Props {
  activeModules: Set<ModuleName>;
  toggleModule: (m: ModuleName) => void;
}

export function ModuleSidebar({ activeModules, toggleModule }: Props) {
  const modules = Object.entries(MODULE_INFO) as [ModuleName, typeof MODULE_INFO[ModuleName]][];

  return (
    <div className="w-56 bg-bg-secondary border-r border-border p-4 flex flex-col gap-2">
      <h2 className="text-xs font-bold uppercase text-text-secondary tracking-wider mb-2">
        Detection Modules
      </h2>
      {modules.map(([key, info]) => {
        const active = activeModules.has(key);
        return (
          <button
            key={key}
            onClick={() => toggleModule(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200
              ${active
                ? 'bg-accent-dim text-accent border border-accent/30'
                : 'bg-bg-card text-text-secondary border border-transparent hover:border-border'
              }`}
          >
            <span>{info.icon}</span>
            <span className="flex-1 text-left">{info.label}</span>
            <div className={`w-8 h-4 rounded-full transition-all duration-300 relative
              ${active ? 'bg-accent' : 'bg-border'}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300
                ${active ? 'left-4.5' : 'left-0.5'}`} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
