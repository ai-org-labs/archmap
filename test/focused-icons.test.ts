import { afterEach, describe, expect, it } from 'vitest';
import { cloudIconCounts, famousServiceIconEntries, installCloudProviderIcons, installFamousServiceIcons } from '@archmap/icons';
import { clearIcons, getIcon, listIcons, type RenderableIcon } from '../src/icons.js';
import { getDiagramIconCatalog, installDiagramIcons } from '../src/focused/icons.js';
import { parseDiagram } from '../src/focused/parser.js';
import { renderDiagram } from '../src/focused/render.js';

const expected = new Map<string, RenderableIcon>();
installCloudProviderIcons((key, icon) => expected.set(key, icon));
installFamousServiceIcons((key, icon) => expected.set(key, icon));
afterEach(clearIcons);

describe('bundled diagram icon coverage', () => {
  it('installs every package icon and alias and lists every usable key', () => {
    clearIcons(); installDiagramIcons();
    expect(famousServiceIconEntries).toHaveLength(98);
    expect(cloudIconCounts).toEqual({aws:305,gcp:261,azure:705});
    const catalog = getDiagramIconCatalog();
    expect(new Set(catalog.map(entry=>entry.key))).toEqual(new Set(listIcons()));
    for(const [key, icon] of expected) {
      expect(getIcon(key), key).toEqual(icon);
      expect(catalog.some(entry=>entry.key===key), key).toBe(true);
    }
    expect(catalog.find(entry=>entry.key==='1password')?.label).toBe('1Password');
    expect(catalog.find(entry=>entry.key==='k8s')?.label).toBe('Kubernetes');
  });
  it('parses and renders the actual SVG for every supported icon key and alias', () => {
    installDiagramIcons();
    for(const [key, icon] of expected) {
      const model=parseDiagram(`diagram system\nstyle icons\nnode service "Service" icon=${key}`);
      expect(model.diagnostics, key).toEqual([]);
      expect(renderDiagram(model).svg, key).toContain(icon.body);
    }
  });
  it('renders newly added services in cards, icons and every diagram kind', () => {
    installDiagramIcons();
    for(const key of ['openai','anthropic','argocd','stripe','gitlab','1password']) {
      expect(getIcon(key),key).toBeDefined();
      for(const kind of ['system','layers','sequence','screens','activity']) {
        const model=parseDiagram(`diagram ${kind}\nnode service "Service" icon=${key}`);
        expect(model.diagnostics).toEqual([]);
        expect(renderDiagram(model).svg).toContain(getIcon(key)!.body);
      }
    }
  });
});
