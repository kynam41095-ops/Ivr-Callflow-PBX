/* <ivr-flow> — React Flow (@xyflow/react) canvas for the IVR builder.
   Loads its own React 18 + react-dom + @xyflow/react from CDN and renders in its
   own root, so it is isolated from the host page's React instance.

   Host API
     el.payload = { stamp, visualStamp, readOnly, edgeType, snap, showMinimap, nodes, edges }
     el.focusNode(id) / el.fitView() / el.autoLayout()
   Events (CustomEvent detail)
     ivr:select {kind:'node'|'edge'|null, id}
     ivr:connect {source, sourceHandle, target}
     ivr:move [{id,x,y}]
     ivr:delete {nodes:[id], edges:[id]}
     ivr:drop {type, x, y}
     ivr:layout [{id,x,y}]
*/
(function () {
  const V = '12.3.6';
  const CDN = 'https://cdn.jsdelivr.net/npm/';

  // Static UMD files, not an ESM build service.
  //
  // esm.sh was the original source and is currently unusable: its build of
  // @xyflow/react reaches use-sync-external-store through a RANGE specifier
  // (^1.2.2) whose build request never returns — measured repeatedly, the
  // pinned version resolves in ~1s while the range hangs past 30s. jsdelivr's
  // /+esm build is no better: it resolves React 19 for xyflow and React 18 for
  // the zustand chain, so two copies of React load and every hook throws.
  //
  // These files are plain assets off a static CDN — no server-side bundling,
  // no dependency resolution, and React is a single global by construction.
  // Measured cold: ~300ms for the whole set.
  const UMD = {
    rf: CDN + '@xyflow/react@' + V + '/dist/umd/index.js',
    dagre: CDN + '@dagrejs/dagre@1.1.4/dist/dagre.min.js',
    css: CDN + '@xyflow/react@' + V + '/dist/style.css',
  };

  const script = src => new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = res;
    el.onerror = () => rej(new Error('không tải được ' + src.slice(CDN.length)));
    document.head.appendChild(el);
  });

  // The UMD bundle expects a `jsxRuntime` global; React ships no UMD build of
  // react/jsx-runtime, so it is reconstructed from createElement.
  function shimJsx(R) {
    if (window.jsxRuntime) return;
    const kids = c => (Array.isArray(c) ? c : [c]);
    const jsx = (type, props, key) => {
      const p = Object.assign({}, props);
      const c = p.children;
      delete p.children;
      if (key !== undefined) p.key = key;
      return c === undefined ? R.createElement(type, p) : R.createElement(type, p, ...kids(c));
    };
    window.jsxRuntime = { Fragment: R.Fragment, jsx, jsxs: jsx };
  }

  // React is the HOST's, always — never fetched here.
  //
  // This file is a <helmet> script, so it runs while the template is still
  // streaming and the element connects before the host runtime's own react and
  // react-dom UMD tags have executed. A "load it if it's missing" guard is
  // therefore a race, not a guard: on a cold load it loses, fetches a second
  // copy of React from a different CDN, and the two clobber each other's
  // globals — the host's react-dom then reads a null ReactCurrentDispatcher and
  // NOTHING on the page renders. (A warm reload hid it: the host's scripts came
  // from cache and won.) So wait for the host's globals instead, however long
  // they take, and only ever fetch the xyflow bundle.
  const waitForReact = () => new Promise((res, rej) => {
    const ready = () => window.React && window.ReactDOM && window.ReactDOM.createRoot;
    if (ready()) return res();
    let n = 0;
    const tick = () => {
      if (ready()) return res();
      if (++n > 600) return rej(new Error('React của trang không khả dụng'));
      setTimeout(tick, 25);
    };
    tick();
  });

  let libs = null;
  function load() {
    if (libs) return libs;
    libs = waitForReact()
      .then(() => { shimJsx(window.React); return window.ReactFlow ? null : script(UMD.rf); })
      .then(() => {
        if (!window.ReactFlow || !window.ReactFlow.ReactFlow) throw new Error('bundle React Flow không hợp lệ');
        return { React: window.React, createRoot: window.ReactDOM.createRoot, RF: window.ReactFlow };
      });
    return libs;
  }

  let dagreP = null;
  const loadDagre = () => (dagreP = dagreP ||
    (window.dagre ? Promise.resolve(window.dagre) : script(UMD.dagre).then(() => window.dagre)));

  function injectCss() {
    if (document.getElementById('ivr-flow-themed-css')) return;
    const l = document.createElement('link');
    l.id = 'xyflow-css'; l.rel = 'stylesheet'; l.href = UMD.css;
    document.head.appendChild(l);
    const s = document.createElement('style');
    s.id = 'ivr-flow-themed-css';
    s.textContent = `
.ivr-flow-host{display:block;position:relative;width:100%;height:100%;background:var(--bg-canvas,#faf7f3)}
.ivr-flow-host .react-flow__attribution{background:transparent;font-size:9px}
.ivr-flow-host .react-flow__attribution a{color:var(--fg-3,#646972);text-decoration:none}
.ivr-flow-host.ivr-anim .react-flow__viewport{transition:transform 320ms cubic-bezier(.4,0,.2,1)}
.ivr-flow-boot{position:absolute;inset:0;display:grid;place-items:center;font:550 14px/20px var(--sans);color:var(--fg-3,#646972);gap:12px}
.ivr-flow-boot span{display:block;width:22px;height:22px;border:2px solid var(--bd,#e8e2da);border-top-color:var(--acc,#325cbd);border-radius:50%;animation:ivrSpin .7s linear infinite;margin:0 auto 12px}
@keyframes ivrSpin{to{transform:rotate(360deg)}}
@keyframes ivrDash{to{stroke-dashoffset:-32}}

/* React Flow keeps a node visibility:hidden until its ResizeObserver reports a
   size. This runtime delivers no observer callbacks and runs no animation
   frames (document.visibilityState is 'hidden'), so that measurement never
   completes and every card stayed invisible. The card's size is fully
   determined by this stylesheet, so nothing is waiting on. */
.ivr-flow-host .react-flow__node{visibility:visible !important}
/* One thick bar of group colour on the top edge, a ring-framed icon, the node's
   own name set in bold caps, and every branch as its own recessed block with a
   status dot. Each region is a distinct surface, so what a region does is read
   from its shape, not from a caption. */
.ivrn{width:284px;border-radius:14px;font-family:var(--sans);background:var(--bg-raised,#fffdfa);
  border:1.5px solid var(--bd,#e8e2da);box-shadow:var(--sh-2)}
.ivrn.sel{border-color:var(--acc-line);box-shadow:0 0 0 2px var(--acc-veil),var(--sh-2)}
/* transition:none is deliberate. This runtime does not run animation frames
   (document.visibilityState is hidden), so a transitioned property never
   advances past its start value — the drop highlight would simply never
   appear. It must land on the frame the pointer enters the card anyway. */
.react-flow__node.ivr-drop .ivrn{border-color:var(--acc-line);box-shadow:0 0 0 3px var(--acc-veil),var(--sh-3)}
.react-flow__node.ivr-drop .ivrn .ivrn-bar{background:var(--acc-line)}
.react-flow__node.ivr-drop .ivrn .ivrh-t{background:var(--acc-line);box-shadow:0 0 0 3px var(--acc-veil)}
.ivrn.warn{border-color:var(--warn-bd)}
.ivrn.err{border-color:var(--err-bd)}
.ivrn-bar{height:6px;border-radius:12px 12px 0 0;background:var(--k-stroke)}
.ivrn-top{display:flex;align-items:center;gap:10px;padding:13px 12px}
.ivrn-ico{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;
  border:1.5px solid var(--k-stroke);color:var(--k-stroke)}
.ivrn-title{flex:1;min-width:0;font:650 14px/28px var(--sans);letter-spacing:.02em;text-transform:uppercase;
  color:var(--fg,#1e242e);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ivrn-kebab{flex:none;width:14px;height:28px;display:grid;place-items:center;color:var(--fg-3,#8b8f97)}
.ivrn-sum{padding:0 14px 12px;font:450 12px/16px var(--mono);font-variant-numeric:tabular-nums;
  color:var(--fg-2,#525862);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ivrn-outs{padding:0 12px 12px;display:flex;flex-direction:column;gap:5px}
.ivrn-out{position:relative;height:34px;display:flex;align-items:center;gap:10px;padding:0 12px;
  border-radius:8px;background:var(--bg-sub,#f5f1eb)}
.ivrn-lab{flex:1;min-width:0;font:550 13px/34px var(--sans);color:var(--fg-2,#525862);
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ivrn-out.fb .ivrn-lab{color:var(--err)}
.ivrn-out.off .ivrn-lab{color:var(--fg-3,#8b8f97)}
.ivrn-st{flex:none;width:10px;height:10px;border-radius:50%;background:var(--ok-dot)}
.ivrn-out.fb .ivrn-st{background:var(--err-dot)}
.ivrn-out.off .ivrn-st{background:transparent;box-shadow:inset 0 0 0 1.5px var(--warn-bd)}
.ivrn-foot{display:flex;align-items:center;gap:7px;padding:8px 14px;border-top:1px solid var(--bd);
  border-radius:0 0 12px 12px;font:550 11px/1.25 var(--sans);letter-spacing:.04em;text-transform:uppercase}
.ivrn-foot.warn{background:var(--warn-soft);border-color:var(--warn-bd);color:var(--warn)}
.ivrn-foot.err{background:var(--err-soft);border-color:var(--err-bd);color:var(--err)}
.ivrn .ivrh{width:11px;height:11px;border-radius:50%;min-width:0;min-height:0;
  border:2px solid var(--bg-raised,#fffdfa);background:var(--bg-raised,#fffdfa);box-shadow:0 0 0 1.5px var(--bd-str)}
.ivrn .ivrh.on{background:var(--k-stroke);box-shadow:0 0 0 1px var(--k-stroke)}
.ivrn-out.fb .ivrh{background:var(--err-dot);box-shadow:0 0 0 1px var(--err-dot)}
.ivrn .ivrh:hover{transform:scale(1.25)}
.ivrn .ivrh-t{left:-6px;top:27px}
.ivrn .ivrh-s{right:-19px;top:50%;transform:translateY(-50%)}
.ivrn .ivrh-s:hover{transform:translateY(-50%) scale(1.25)}
.ivr-flow-host .react-flow__controls{box-shadow:var(--sh-1);border:1px solid var(--bd,#e8e2da);border-radius:8px;overflow:hidden}
.ivr-flow-host .react-flow__controls-button{background:var(--bg-raised,#fffdfa);border-bottom:1px solid var(--bd,#e8e2da);width:28px;height:28px;fill:var(--fg-2,#525862)}
.ivr-flow-host .react-flow__controls-button:hover{background:var(--bg-muted,#f0ece5)}
.ivr-flow-host .react-flow__minimap{border:1px solid var(--bd,#e8e2da);border-radius:8px;overflow:hidden}
.ivr-flow-host .react-flow__edge-path{stroke-linecap:round}
.ivr-flow-host .react-flow__edge.selected .react-flow__edge-path{stroke:var(--acc,#325cbd);stroke-width:2.4}
/* The marquee is a veil, not a panel: it must stay translucent and sit under
   the nodes, or a drag across the canvas hides the very nodes being framed. */
.ivr-flow-host .react-flow__selection{background:var(--acc-veil);border:1px solid var(--acc);
  border-radius:4px;z-index:0;pointer-events:none}
.ivr-flow-host .react-flow__nodes{z-index:5}
.ivr-flow-host.ivr-marquee .react-flow__pane{cursor:crosshair}
/* React Flow tags the pane with a selection class whenever a selectionKeyCode
   is set, and styles it cursor:pointer. Outside marquee mode the left button
   still pans, so the cursor must keep saying so. */
.ivr-flow-host:not(.ivr-marquee) .react-flow__pane.selection{cursor:grab}
.ivr-flow-host:not(.ivr-marquee) .react-flow__pane.selection:active{cursor:grabbing}
.ivr-flow-host .react-flow__connectionline path{stroke:var(--acc,#325cbd);stroke-width:2;stroke-dasharray:5 4}
`;
    document.head.appendChild(s);
  }

  function build(React, RF) {
    const { Handle, Position } = RF;
    const ICON = {
      start:'M16 2v6h6|m22 2-6 6|M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.1 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z',
      hangup:'M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1|M5.3 12.6A19.8 19.8 0 0 1 2.1 4 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9|M2 2 22 22',
      goto:'M15 14l5-5-5-5|M20 9H9a5 5 0 0 0 0 10h1',
      play:'M11 5 6 9H2v6h4l5 4V5Z|M15.5 8.5a5 5 0 0 1 0 7',
      dtmf:'M4 9h16|M4 15h16|M10 3 8 21|M16 3l-2 18',
      survey:'M9 11l3 3 8-8|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
      time:'M12 6v6l4 2|M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
      branch:'M6 3v12|M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z|M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z|M18 9a9 9 0 0 1-9 9',
      black:'M20 13c0 5-3.5 7.5-7.7 9a2 2 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a2 2 0 0 1 2-2c2 0 4.5-1.2 6-2.5C13.5 2.8 16 4 18 4a2 2 0 0 1 2 2Z|M9 12l2 2 4-4',
      ext:'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3',
      queue:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z|M22 21v-2a4 4 0 0 0-3-3.9',
      api:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z|M3.6 9h16.8|M3.6 15h16.8|M12 3a15 15 0 0 1 0 18|M12 3a15 15 0 0 0 0 18',
      setvar:'M4 7V4h16v3|M9 20h6|M12 4v16',
    };
    const IvrNode = React.memo(function IvrNode(p) {
      const d = p.data;
      // Group colour is resolved in CSS from the kind, so a theme switch
      // re-resolves it without touching the node array.
      const vars = {
        position:'relative',
        '--k-stroke':'var(--n-' + d.kind + '-b)',
        '--k-fill':'var(--n-' + d.kind + '-s)',
        '--k-ink':'var(--n-' + d.kind + '-t)',
      };
      const outs = d.outs || [];
      const unlinked = outs.filter(o => !o.connected).length;
      const cls = 'ivrn' + (p.selected ? ' sel' : d.sim ? ' sel' : d.badConfig ? ' err' : unlinked ? ' warn' : '');
      const paths = (ICON[d.kind] || ICON.goto).split('|');
      const kids = [
        React.createElement(Handle, { key:'t', type:'target', position:Position.Left,
          className:'ivrh ivrh-t' + (d.hasIn ? ' on' : ''), isConnectable:!d.readOnly }),
        React.createElement('div', { key:'bar', className:'ivrn-bar' }),
        React.createElement('div', { key:'top', className:'ivrn-top' },
          React.createElement('span', { className:'ivrn-ico' },
            React.createElement('svg', { width:15, height:15, viewBox:'0 0 24 24', fill:'none',
              stroke:'currentColor', strokeWidth:1.6, strokeLinecap:'round', strokeLinejoin:'round' },
              paths.map((dd, i) => React.createElement('path', { key:i, d:dd })))),
          React.createElement('span', { className:'ivrn-title', title:d.typeLabel }, d.name),
          React.createElement('span', { className:'ivrn-kebab' },
            React.createElement('svg', { width:14, height:14, viewBox:'0 0 24 24', fill:'currentColor' },
              React.createElement('circle', { cx:12, cy:5, r:1.6 }),
              React.createElement('circle', { cx:12, cy:12, r:1.6 }),
              React.createElement('circle', { cx:12, cy:19, r:1.6 })))),
        React.createElement('div', { key:'su', className:'ivrn-sum' }, d.summary),
      ];
      if (outs.length) {
        kids.push(React.createElement('div', { key:'o', className:'ivrn-outs' },
          outs.map((o, i) => React.createElement('div',
            { key:i, className:'ivrn-out' + (o.fallback ? ' fb' : o.connected ? '' : ' off') },
            React.createElement('span', { className:'ivrn-lab' }, o.label),
            React.createElement('span', { className:'ivrn-st' }),
            React.createElement(Handle, { type:'source', position:Position.Right, id:String(i),
              className:'ivrh ivrh-s' + (o.connected ? ' on' : ''), isConnectable:!d.readOnly })))));
      }
      if (d.badConfig) {
        kids.push(React.createElement('div', { key:'f', className:'ivrn-foot err' }, d.badConfig));
      } else if (unlinked) {
        kids.push(React.createElement('div', { key:'f', className:'ivrn-foot warn' },
          unlinked + ' nhánh chưa nối'));
      }
      return React.createElement('div', { className:cls, style:vars }, kids);
    });
    return { ivr: IvrNode };
  }

  function makeCanvas(React, RF, nodeTypes) {
    const { ReactFlow, Background, BackgroundVariant, Controls, useNodesState, useEdgesState, useReactFlow, useNodesInitialized, useUpdateNodeInternals, ViewportPortal } = RF;

    // Handle geometry, read straight off the card's stylesheet rather than
    // measured: border 1.5 + header 30 + title 24 + summary 29 = 84.5 to the
    // top of the branch list, .ivrn-outs adds 2, each row is 24 tall, and the
    // target dot sits at top:21 + half of its 9px box.
    const NW = 284, T_Y = 33, OUT_Y0 = 105, OUT_DY = 39;
    function edgePath(kind, sx, sy, tx, ty) {
      if (kind === 'straight') return 'M' + sx + ',' + sy + ' L' + tx + ',' + ty;
      if (kind === 'step' || kind === 'smoothstep') {
        const mx = (sx + tx) / 2, r = Math.min(12, Math.abs(ty - sy) / 2, Math.abs(mx - sx));
        if (r < 1 || Math.abs(ty - sy) < 1) return 'M' + sx + ',' + sy + ' L' + tx + ',' + ty;
        const d = ty > sy ? 1 : -1;
        return 'M' + sx + ',' + sy +
          ' L' + (mx - r) + ',' + sy +
          ' Q' + mx + ',' + sy + ' ' + mx + ',' + (sy + d * r) +
          ' L' + mx + ',' + (ty - d * r) +
          ' Q' + mx + ',' + ty + ' ' + (mx + r) + ',' + ty +
          ' L' + tx + ',' + ty;
      }
      const k = Math.max(40, Math.abs(tx - sx) * 0.5);
      return 'M' + sx + ',' + sy + ' C' + (sx + k) + ',' + sy + ' ' + (tx - k) + ',' + ty + ' ' + tx + ',' + ty;
    }
    return function Canvas({ payload, emit, api, host }) {
      const [nodes, setNodes, onNodesChange] = useNodesState(payload.nodes);
      const [edges, setEdges, onEdgesChange] = useEdgesState(payload.edges);
      // Declared up here because the class-sync effect below reads it.
      const [dropTarget, setDropTarget] = React.useState(null);
      const rf = useReactFlow();
      const inited = useNodesInitialized ? useNodesInitialized() : false;
      const updateInternals = useUpdateNodeInternals ? useUpdateNodeInternals() : null;
      const wrap = React.useRef(null);
      const fitted = React.useRef(false);

      React.useEffect(() => { setNodes(payload.nodes); }, [payload.stamp, payload.visualStamp]);

      // The pending-drop flag rides on a class, not through the node array: a
      // re-adopt would discard React Flow's node internals mid-drag.
      React.useEffect(() => {
        const root = wrap.current;
        if (!root) return;
        root.querySelectorAll('.react-flow__node').forEach(d => {
          d.classList.toggle('ivr-drop', d.dataset.id === dropTarget);
        });
      }, [dropTarget, nodes]);

      // Drive measurement instead of waiting for React Flow's ResizeObserver.
      // Measured: a fresh observer on a 284x120 node card delivers nothing here,
      // so RF never learns a node's size — and an unmeasured node has no
      // handleBounds, which is what leaves the canvas showing disconnected cards
      // with zero edges. updateNodeInternals reads the real DOM boxes, so it does
      // not depend on the observer at all; a few repeats cover the frames before
      // layout has settled.
      React.useEffect(() => {
        if (!updateInternals) return;
        const ids = payload.nodes.map(n => n.id);
        if (!ids.length) return;
        let n = 0, stop = false;
        const kick = () => {
          if (stop) return;
          updateInternals(ids);
          if (++n < 6) setTimeout(kick, 100);
        };
        // setTimeout, not requestAnimationFrame: rAF does not run while the
        // document is hidden (an iframe that is not being painted), and the
        // measure pass must still complete so edges exist when it is shown.
        const t = setTimeout(kick, 0);
        return () => { stop = true; clearTimeout(t); };
      }, [payload.stamp]);
      React.useEffect(() => { setEdges(payload.edges); }, [payload.stamp, payload.visualStamp]);

      React.useEffect(() => {
        api.current = {
          focusNode(id) { if (host) host.focusNode(id); },
          fit() { if (host) host.fitView(true); },
          async layout() {
            const dagre = await loadDagre();
            const g = new dagre.graphlib.Graph();
            g.setDefaultEdgeLabel(() => ({}));
            g.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 84, marginx: 40, marginy: 40 });
            payload.nodes.forEach(n => g.setNode(n.id, { width: 284, height: n.data.h || 120 }));
            payload.edges.forEach(e => g.setEdge(e.source, e.target));
            dagre.layout(g);
            const out = payload.nodes.map(n => {
              const p = g.node(n.id);
              return { id: n.id, x: Math.round(p.x - 142), y: Math.round(p.y - (n.data.h || 120) / 2) };
            });
            emit('ivr:layout', { list: out, silent: true });
          },
        };
      });

      React.useEffect(() => {
        fitted.current = false;
      }, [payload.stamp.split('|')[0]]);

      React.useEffect(() => {
        if (fitted.current) return;
        let tries = 0, stop = false;
        const tick = () => {
          if (stop || fitted.current) return;
          // Gate on the instance and a laid-out box, NOT on node measurement:
          // measurement never completes without resize observations, and framing
          // does not need it — the geometry comes from the payload.
          if (host && host._rf && host.clientWidth && payload.nodes.length) {
            fitted.current = true;
            if (payload.autoLayout && api.current) api.current.layout();
            else host.fitView(false);
            return;
          }
          if (tries++ < 60) setTimeout(tick, 60);
        };
        tick();
        return () => { stop = true; };
      }, [payload.stamp.split('|')[0], payload.nodes.length, inited]);

      // The host bumps fitStamp once it has committed new positions.
      const firstFit = React.useRef(true);
      React.useEffect(() => {
        if (firstFit.current) { firstFit.current = false; return; }
        if (host) host.fitView(true);
      }, [payload.fitStamp]);

      // Connections are drawn here instead of by React Flow: its edge renderer
      // needs each node's handleBounds, which only exist once the node has been
      // measured, and measurement cannot complete in a runtime with no resize
      // observations. Every coordinate needed is already known — node position
      // from the live node state, handle offsets fixed by the card's CSS.
      //
      // Positions come from `nodes` (React Flow's own state, updated on every
      // frame of a drag), NOT from payload.nodes — the host only learns the new
      // position on drag STOP, so drawing from the payload left every edge
      // pinned to where the node used to be until the mouse was released.
      const conns = React.useMemo(() => {
        const by = new Map(nodes.map(n => [n.id, n]));
        return (payload.edges || []).map(e => {
          const a = by.get(e.source), b = by.get(e.target);
          if (!a || !b) return null;
          const i = parseInt(e.sourceHandle || '0', 10) || 0;
          const sx = a.position.x + NW, sy = a.position.y + OUT_Y0 + OUT_DY * i;
          const tx = b.position.x, ty = b.position.y + T_Y;
          return {
            id: e.id, selected: e.selected, animated: e.animated,
            source: e.source, sourceHandle: e.sourceHandle, target: e.target,
            stroke: (e.style && e.style.stroke) || 'var(--bd-str)',
            width: (e.style && e.style.strokeWidth) || 1.8,
            dash: e.style && e.style.strokeDasharray,
            sx, sy, tx, ty,
            d: edgePath(payload.edgeType, sx, sy, tx, ty),
          };
        }).filter(Boolean);
      }, [nodes, payload.edges, payload.visualStamp, payload.edgeType]);

      // The minimap is drawn from the same payload geometry as the edges, for
      // the same reason: React Flow's own MiniMap plots node.measured, which is
      // never populated here, so it renders as an empty box.
      const mini = React.useMemo(() => {
        const ns = payload.nodes;
        if (!ns || !ns.length) return null;
        const W = 152, H = 104, P = 8;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        ns.forEach(n => {
          const h = (n.data && n.data.h) || 120;
          x0 = Math.min(x0, n.position.x); y0 = Math.min(y0, n.position.y);
          x1 = Math.max(x1, n.position.x + NW); y1 = Math.max(y1, n.position.y + h);
        });
        const k = Math.min((W - P * 2) / (x1 - x0), (H - P * 2) / (y1 - y0));
        const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
        const at = (x, y) => ({ x: ox + (x - x0) * k, y: oy + (y - y0) * k });
        const rects = ns.map(n => {
          const p = at(n.position.x, n.position.y);
          return { id: n.id, kind: n.data.kind, x: p.x, y: p.y,
                   w: Math.max(2, NW * k), h: Math.max(1.5, ((n.data && n.data.h) || 120) * k) };
        });
        let view = null;
        const i = host && host._rf, el = wrap.current;
        if (i && el && el.clientWidth) {
          const vp = i.getViewport();
          const tl = at(-vp.x / vp.zoom, -vp.y / vp.zoom);
          view = { x: tl.x, y: tl.y, w: (el.clientWidth / vp.zoom) * k, h: (el.clientHeight / vp.zoom) * k };
        }
        return { rects, view };
      }, [payload.stamp, payload.visualStamp, payload.fitStamp]);

      const [hoverEdge, setHoverEdge] = React.useState(null);
      const dragFrom = React.useRef(null), dropped = React.useRef(false);

      // Re-pointing a connection. React Flow's own reconnect machinery works on
      // edges IT renders, and these are drawn by hand (its edge renderer needs
      // handleBounds, which never materialise in this runtime), so the drag is
      // implemented here: grab the arrow end, and the path follows the pointer
      // from the SAME source port until it is dropped on another card. Dropping
      // on empty canvas cancels and leaves the connection as it was — a missed
      // drop should never silently delete a branch.
      const [redo, setRedo] = React.useState(null);
      const startReconnect = React.useCallback((c, ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const move = e => {
          const pt = e.touches ? e.touches[0] : e;
          if (!pt || pt.clientX === undefined) return;
          const fp = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
          const hit = payload.nodes.find(n => {
            const h = (n.data && n.data.h) || 120;
            return fp.x >= n.position.x && fp.x <= n.position.x + NW &&
                   fp.y >= n.position.y && fp.y <= n.position.y + h;
          });
          const id = hit && hit.id !== c.source ? hit.id : null;
          setDropTarget(t => (t === id ? t : id));
          setRedo(r => (r ? { ...r, x: fp.x, y: fp.y, over: id } : r));
        };
        const end = e => {
          window.removeEventListener('pointermove', move, true);
          window.removeEventListener('pointerup', end, true);
          window.removeEventListener('touchmove', move, true);
          window.removeEventListener('touchend', end, true);
          const pt = e && (e.changedTouches ? e.changedTouches[0] : e);
          let target = null;
          if (pt && pt.clientX !== undefined) {
            const fp = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
            const hit = payload.nodes.find(n => {
              const h = (n.data && n.data.h) || 120;
              return fp.x >= n.position.x && fp.x <= n.position.x + NW &&
                     fp.y >= n.position.y && fp.y <= n.position.y + h;
            });
            if (hit && hit.id !== c.source) target = hit.id;
          }
          setDropTarget(null);
          setRedo(null);
          if (target && target !== c.target) {
            emit('ivr:connect', { source: c.source, sourceHandle: c.sourceHandle, target });
          }
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', end, true);
        window.addEventListener('touchmove', move, true);
        window.addEventListener('touchend', end, true);
        setRedo({ id: c.id, sx: c.sx, sy: c.sy, x: c.tx, y: c.ty, over: null });
      }, [rf, payload.nodes, emit]);

      const ro = payload.readOnly;
      return React.createElement('div', {
        ref: wrap, style: { position: 'absolute', inset: 0 },
        onDragOver: e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
        onDrop: e => {
          e.preventDefault();
          const type = e.dataTransfer.getData('text/ivr-node');
          if (!type) return;
          const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          emit('ivr:drop', { type, x: Math.round(p.x - 142), y: Math.round(p.y - 50) });
        },
      }, React.createElement(ReactFlow, {
        nodes, edges: [], nodeTypes,
        onInit: i => emit('ivr:init', i),
        onNodesChange, onEdgesChange,
        nodesDraggable: !ro, nodesConnectable: !ro, elementsSelectable: true,
        deleteKeyCode: ro ? null : ['Delete', 'Backspace'],
        snapToGrid: payload.snap > 0, snapGrid: [payload.snap || 1, payload.snap || 1],
        minZoom: 0.1, maxZoom: 1.75,
        // Marquee mode swaps the left button from panning to a selection box;
        // panning then moves to the middle and right buttons. Shift+drag draws a
        // box in either mode, so a keyboard user never has to flip the toggle.
        selectionOnDrag: !ro && payload.marquee,
        panOnDrag: (!ro && payload.marquee) ? [1, 2] : true,
        selectionKeyCode: ro ? null : 'Shift',
        multiSelectionKeyCode: ro ? null : ['Meta', 'Control'],
        selectionMode: 'partial',
        zoomOnDoubleClick: false,
        defaultEdgeOptions: { type: payload.edgeType },
        connectionRadius: 44,
        isValidConnection: c => c.source !== c.target,
        onConnectStart: (e, p) => {
          dragFrom.current = p;
          dropped.current = false;
          if (p.handleType !== 'source') return;
          // Track the pointer for as long as the drag lasts and mark whichever
          // card it is over as the pending drop target.
          const move = ev => {
            const pt = ev.touches ? ev.touches[0] : ev;
            if (!pt || pt.clientX === undefined) return;
            const fp = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
            const hit = payload.nodes.find(n => {
              const h = (n.data && n.data.h) || 120;
              return fp.x >= n.position.x && fp.x <= n.position.x + NW &&
                     fp.y >= n.position.y && fp.y <= n.position.y + h;
            });
            const id = hit && hit.id !== p.nodeId ? hit.id : null;
            setDropTarget(t => (t === id ? t : id));
          };
          const end = () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', end, true);
            window.removeEventListener('touchmove', move, true);
            window.removeEventListener('touchend', end, true);
            setDropTarget(null);
          };
          window.addEventListener('pointermove', move, true);
          window.addEventListener('pointerup', end, true);
          window.addEventListener('touchmove', move, true);
          window.addEventListener('touchend', end, true);
        },
        onConnect: c => {
          dropped.current = true;
          emit('ivr:connect', { source: c.source, sourceHandle: c.sourceHandle, target: c.target });
        },
        // Dropping anywhere on a node connects to it. A node has exactly one
        // input, so requiring the pointer to land on that 11px dot is a
        // precision tax with no meaning behind it — anywhere on the card is
        // unambiguous.
        onConnectEnd: e => {
          const from = dragFrom.current;
          dragFrom.current = null;
          if (dropped.current || !from || from.handleType !== 'source') return;
          const pt = e.changedTouches ? e.changedTouches[0] : e;
          if (!pt || pt.clientX === undefined) return;
          const p = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
          const hit = payload.nodes.find(n => {
            const h = (n.data && n.data.h) || 120;
            return p.x >= n.position.x && p.x <= n.position.x + NW &&
                   p.y >= n.position.y && p.y <= n.position.y + h;
          });
          if (!hit || hit.id === from.nodeId) return;
          emit('ivr:connect', { source: from.nodeId, sourceHandle: from.handleId, target: hit.id });
        },
        onNodeClick: (e, n) => emit('ivr:select', { kind: 'node', id: n.id }),
        onEdgeClick: (e, ed) => emit('ivr:select', { kind: 'edge', id: ed.id }),
        onPaneClick: () => emit('ivr:select', { kind: null, id: null }),
        onNodeDragStop: (e, n, ns) => emit('ivr:move', ((ns && ns.length ? ns : [n])).map(x => ({ id: x.id, x: Math.round(x.position.x), y: Math.round(x.position.y) }))),
        onNodesDelete: ns => emit('ivr:delete', { nodes: ns.map(n => n.id), edges: [] }),
        onEdgesDelete: es => emit('ivr:delete', { nodes: [], edges: es.map(e => e.id) }),
      },
        ViewportPortal ? React.createElement(ViewportPortal, null,
          React.createElement('svg', {
            style: { position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: 0 },
          },
            React.createElement('defs', null,
              React.createElement('marker', {
                id: 'ivr-arrow', viewBox: '0 0 10 10', refX: 8.5, refY: 5,
                markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse',
              }, React.createElement('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'context-stroke' }))),
            // A selected edge gets a halo behind it. Recolouring a 1.8px line
            // is not a visible enough answer to "is this the one I clicked".
            conns.filter(c => c.selected || c.id === hoverEdge).map(c => React.createElement('path', {
              key: c.id + '-h', d: c.d, fill: 'none',
              stroke: c.selected ? 'var(--acc)' : 'var(--bd-str)',
              strokeWidth: c.selected ? 9 : 7, strokeLinecap: 'round',
              opacity: c.selected ? 0.22 : 0.16,
              style: { pointerEvents: 'none' },
            })),
            conns.filter(c => !redo || c.id !== redo.id).map(c => React.createElement('path', {
              key: c.id, d: c.d, fill: 'none',
              stroke: c.selected ? 'var(--acc)' : c.stroke,
              strokeWidth: c.selected ? 2.6 : (c.id === hoverEdge ? (c.width || 1.8) + 0.8 : c.width),
              strokeDasharray: c.dash, strokeLinecap: 'round',
              markerEnd: 'url(#ivr-arrow)',
              style: { pointerEvents: 'none' },
            })),
            // The line itself is too thin to aim at, so the pointer target is a
            // 16px-wide invisible ribbon following the same path.
            conns.map(c => React.createElement('path', {
              key: c.id + '-hit', d: c.d, fill: 'none', stroke: 'transparent', strokeWidth: 16,
              style: { pointerEvents: 'stroke', cursor: 'pointer' },
              onClick: ev => { ev.stopPropagation(); emit('ivr:select', { kind: 'edge', id: c.id }); },
              onMouseEnter: () => setHoverEdge(c.id),
              onMouseLeave: () => setHoverEdge(h => (h === c.id ? null : h)),
            })),
            // Grab dot at the arrow end: the affordance for re-pointing a
            // connection somewhere else. Only shown on the connection under the
            // pointer or the selected one, so 27 dots do not litter the canvas.
            ro ? null : conns.filter(c => (c.selected || c.id === hoverEdge) && (!redo || c.id !== redo.id))
              .map(c => React.createElement('circle', {
                key: c.id + '-grab', cx: c.tx, cy: c.ty, r: 5.5,
                fill: 'var(--bg-raised)', stroke: 'var(--acc)', strokeWidth: 2,
                style: { pointerEvents: 'all', cursor: 'grab' },
                onPointerDown: ev => startReconnect(c, ev),
                onMouseEnter: () => setHoverEdge(c.id),
              })),
            redo ? React.createElement('g', { key: 'redo', style: { pointerEvents: 'none' } },
              React.createElement('path', {
                d: edgePath(payload.edgeType, redo.sx, redo.sy, redo.x, redo.y),
                fill: 'none', stroke: 'var(--acc)', strokeWidth: 2.4,
                strokeDasharray: '6 5', strokeLinecap: 'round',
              }),
              React.createElement('circle', {
                cx: redo.x, cy: redo.y, r: redo.over ? 7 : 4.5,
                fill: redo.over ? 'var(--acc)' : 'var(--bg-raised)',
                stroke: 'var(--acc)', strokeWidth: 2,
              })) : null,
            conns.filter(c => c.animated).map(c => React.createElement('path', {
              key: c.id + '-a', d: c.d, fill: 'none', stroke: c.stroke,
              strokeWidth: (c.width || 1.8) + 1.4, strokeLinecap: 'round',
              strokeDasharray: '6 10', opacity: 0.9,
              style: { pointerEvents: 'none', animation: 'ivrDash 900ms linear infinite' },
            })))) : null,
        React.createElement(Background, { variant: BackgroundVariant.Dots, gap: 18, size: 1, color: payload.theme === 'dark' ? '#26252c' : '#e7e2dc' }),
        React.createElement(Controls, { showInteractive: false, position: 'bottom-right' }),
        payload.showMinimap && mini ? React.createElement('div', {
          style: {
            position: 'absolute', left: 12, bottom: 12, width: 152, height: 104, zIndex: 5,
            background: 'var(--bg-raised)', border: '1px solid var(--bd)', borderRadius: 8,
            boxShadow: 'var(--sh-1)', overflow: 'hidden', pointerEvents: 'none',
          },
        }, React.createElement('svg', { width: 152, height: 104, style: { display: 'block' } },
          mini.rects.map(r => React.createElement('rect', {
            key: r.id, x: r.x, y: r.y, width: r.w, height: r.h, rx: 1.5,
            fill: 'var(--n-' + r.kind + '-b)', opacity: 0.85,
          })),
          mini.view ? React.createElement('rect', {
            x: mini.view.x, y: mini.view.y, width: mini.view.w, height: mini.view.h,
            fill: 'none', stroke: 'var(--acc)', strokeWidth: 1.5, rx: 2,
          }) : null)) : null));
    };
  }

  class IvrFlow extends HTMLElement {
    constructor() { super(); this._payload = { nodes: [], edges: [], stamp: '', visualStamp: '', edgeType: 'default', snap: 16, showMinimap: true }; this._api = { current: null }; }

    set payload(v) { this._payload = v; this.setMarquee(v.marquee); this._render(); }
    get payload() { return this._payload; }

    // The usable box. When the inspector overlays the canvas on a narrow
    // viewport, clientWidth is NOT what the user can see — framing against it
    // pushes the graph behind the panel. The host publishes the covered width
    // as payload.insetRight and this is the only place that resolves it.
    _view() {
      return { W: Math.max(120, this.clientWidth - (this._payload.insetRight || 0)), H: this.clientHeight };
    }

    _box(nodes) {
      const ns = nodes || this._payload.nodes;
      if (!ns || !ns.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      ns.forEach(n => {
        const h = (n.data && n.data.h) || 120;
        x0 = Math.min(x0, n.position.x); y0 = Math.min(y0, n.position.y);
        x1 = Math.max(x1, n.position.x + 284); y1 = Math.max(y1, n.position.y + h);
      });
      return { x0, y0, w: x1 - x0, h: y1 - y0 };
    }

    // Where a flow begins: the node nothing points at, or failing that the
    // leftmost one.
    _entry() {
      const ns = this._payload.nodes || [];
      if (!ns.length) return null;
      const targets = new Set((this._payload.edges || []).map(e => e.target));
      return ns.find(n => !targets.has(n.id)) ||
        ns.reduce((a, b) => (b.position.x < a.position.x ? b : a), ns[0]);
    }

    // The opening view. Fitting a 40-node flow into an iframe drops it to ~15%,
    // where nothing is legible and the eye has no place to start. So: fit
    // everything only while that stays readable; past that, frame the start
    // node and the ring of nodes it reaches, and let the rest be scrolled to.
    // The frame always begins at the start node, so "where does this flow
    // enter" is answered before anything else.
    _focusBox(minZoom) {
      const ns = this._payload.nodes || [];
      const entry = this._entry();
      if (!entry) return null;
      const edges = this._payload.edges || [];
      const byId = new Map(ns.map(n => [n.id, n]));
      // grow the neighbourhood a hop at a time, stopping before the frame
      // would shrink past the legibility floor
      let ring = new Set([entry.id]);
      let best = this._box([entry]);
      for (let hop = 0; hop < 6; hop++) {
        const next = new Set(ring);
        edges.forEach(e => {
          if (ring.has(e.source) && byId.has(e.target)) next.add(e.target);
          if (ring.has(e.target) && byId.has(e.source)) next.add(e.source);
        });
        if (next.size === ring.size) break;
        const box = this._box([...next].map(id => byId.get(id)));
        if (this._zoomFor(box) < minZoom) break;
        ring = next; best = box;
      }
      return best;
    }

    _zoomFor(b) {
      const { W, H } = this._view();
      if (!b || !W || !H) return 0;
      const P = 28;
      return Math.min(0.92, (W - P * 2) / b.w, (H - P * 2) / b.h);
    }

    // Applied instantly and animated in CSS: React Flow's own \`duration\`
    // option is silently dropped here (measured — 0 lands every time, 420
    // never does) because the d3 transition it schedules is torn down by the
    // host's re-renders.
    _move(vp, animate) {
      const i = this._rf;
      if (!i) return;
      if (animate) {
        this.classList.add('ivr-anim');
        clearTimeout(this._animT);
        this._animT = setTimeout(() => this.classList.remove('ivr-anim'), 360);
      }
      i.setViewport(vp, { duration: 0 });
    }

    setMarquee(on) { this.classList.toggle('ivr-marquee', !!on); }

    focusNode(id) {
      const i = this._rf, n = (this._payload.nodes || []).find(x => x.id === id);
      const { W, H } = this._view();
      if (!i || !n || !W || !H) return;
      const h = (n.data && n.data.h) || 120;
      const z = Math.max(0.72, Math.min(1.1, i.getZoom() || 0.8));
      this._move({ x: W / 2 - (n.position.x + 142) * z, y: H / 2 - (n.position.y + h / 2) * z, zoom: z }, true);
    }

    // minZoom is the legibility floor. Fitting a 40-node flow into an iframe
    // drops it to ~15%, where nothing reads and the eye has nowhere to start —
    // so below the floor we frame the start node and the ring it reaches
    // instead, and let the far nodes be panned to.
    fitView(animate, minZoom) {
      // 0.42 is where a node stops being a readable object and becomes a
      // coloured block. Above it, showing the whole flow is worth more than
      // magnification; below it, nothing is gained by cramming everything in.
      const floor = minZoom === undefined ? 0.42 : minZoom;
      const { W, H } = this._view();
      if (!W || !H) return;
      let b = this._box();
      if (!b) return;
      let z = this._zoomFor(b);
      let anchorStart = false;
      if (z < floor) {
        const fb = this._focusBox(floor);
        if (fb) { b = fb; z = this._zoomFor(fb); anchorStart = true; }
      }
      z = Math.max(0.08, z);
      const P = 28;
      this._move({
        // Centred when the whole graph fits; pinned to the left edge when we
        // fell back to the start node, so reading runs start → outward.
        x: anchorStart ? P - b.x0 * z : (W - b.w * z) / 2 - b.x0 * z,
        y: (H - b.h * z) / 2 - b.y0 * z,
        zoom: z,
      }, animate !== false);
    }

    autoLayout() { this._api.current && this._api.current.layout(); }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      this.classList.add('ivr-flow-host');
      this.addEventListener('ivr:init', e => { this._rf = e.detail; });
      injectCss();
      this._boot = document.createElement('div');
      this._boot.className = 'ivr-flow-boot';
      this._boot.innerHTML = '<div><span></span>Đang tải canvas…</div>';
      this.appendChild(this._boot);
      this._mount = document.createElement('div');
      this._mount.style.cssText = 'position:absolute;inset:0';
      this.appendChild(this._mount);
      load().then(({ React, createRoot, RF }) => {
        this._React = React; this._RF = RF;
        const Canvas = makeCanvas(React, RF, build(React, RF));
        this._Canvas = Canvas;
        this._root = createRoot(this._mount);
        this._boot.remove();
        this._render();
      }).catch(err => {
        this._boot.innerHTML = '<div style="text-align:center;max-width:280px">'
          + '<div style="color:var(--err,#c52b30);font:550 14px/1.5 var(--sans,system-ui)">Không tải được thư viện canvas</div>'
          + '<div style="font:450 12px/1.6 var(--sans,system-ui);color:var(--fg-2,#525862);margin-top:6px">Cả hai nguồn CDN đều không phản hồi. Kiểm tra kết nối mạng rồi tải lại trang.</div>'
          + '<button style="margin-top:12px;height:32px;padding:0 12px;cursor:pointer;font:550 12px/1 var(--sans,system-ui);color:var(--fg,#1e242e);background:var(--bg-raised,#fff);border:1px solid var(--bd-str,#8e8a83);border-radius:8px" onclick="location.reload()">Tải lại</button>'
          + '<div style="font:450 11px/1.5 var(--mono,monospace);color:var(--fg-3,#646972);margin-top:10px;word-break:break-word">' + (err && err.message || '') + '</div></div>';
      });
    }

    _render() {
      if (!this._root) return;
      const R = this._React, RF = this._RF;
      const emit = (name, detail) => this.dispatchEvent(new CustomEvent(name, { detail, bubbles: false }));
      this._root.render(R.createElement(RF.ReactFlowProvider, null,
        R.createElement(this._Canvas, { payload: this._payload, emit, api: this._api, host: this })));
    }
  }

  if (!customElements.get('ivr-flow')) customElements.define('ivr-flow', IvrFlow);
})();
