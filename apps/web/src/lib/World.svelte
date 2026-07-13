<script lang="ts">
  import Inbox from "./Inbox.svelte";
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
</script>

<StatusBar />

<main>
  <div class="head">
    <div>
      <p class="eyebrow">World</p>
      <h2>Messages, people, work, and clubs</h2>
    </div>
  </div>

  <section class="sections" aria-label="World sections">
    <article class="section active">
      <span class="icon">✉</span>
      <div>
        <h3>Inbox</h3>
        <p>Invitations, draw notes, ranking digests, and world news.</p>
      </div>
    </article>
    <article class="section muted">
      <span class="icon">🤝</span>
      <div>
        <h3>Social</h3>
        <p>Rivals, friends, and training partners will live here.</p>
      </div>
    </article>
    <article class="section muted">
      <span class="icon">💼</span>
      <div>
        <h3>Work</h3>
        <p>Job commitments and income hooks are planned for this hub.</p>
      </div>
    </article>
    <article class="section muted">
      <span class="icon">🏟️</span>
      <div>
        <h3>Clubs</h3>
        <p>Club reputation, facilities, and local connections can grow here.</p>
      </div>
    </article>
  </section>

  <Inbox embedded />
</main>

<TabBar />

<style>
  main {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .head {
    margin-bottom: 12px;
  }

  .eyebrow {
    color: var(--accent);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin-bottom: 3px;
    text-transform: uppercase;
  }

  h2 {
    font-size: 19px;
  }

  .sections {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 14px;
  }

  .section {
    display: flex;
    gap: 9px;
    min-height: 86px;
    padding: 11px;
    border-radius: 14px;
    background: var(--card);
    border: 1px solid var(--border);
  }

  .section.active {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }

  .section.muted {
    opacity: 0.72;
  }

  .icon {
    font-size: 20px;
    line-height: 1.2;
  }

  h3 {
    font-size: 13px;
    margin-bottom: 4px;
  }

  p {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
</style>
