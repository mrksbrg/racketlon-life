<script lang="ts">
  import { defaultContent } from "@racketlon/content";
  import { SPORTS } from "@racketlon/engine";
  import {
    ATTR_META,
    CHAR_ATTRS,
    NATIONALITIES,
    SPORT_META,
    STAT_MAX,
    type StatKey,
    ageFromBirthDate,
    canLower,
    canRaise,
    nextRaiseCost,
    statValue,
  } from "./character";
  import { store } from "./store.svelte";

  const age = $derived(ageFromBirthDate(store.draft.birthDate));

  const traits = $derived(
    store.draft.traits.map((id) => defaultContent.traits[id]).filter((t) => t !== undefined),
  );

  const rows: { key: StatKey; label: string; hint: string; color: string }[] = $derived([
    ...SPORTS.map((s) => ({ key: s as StatKey, ...SPORT_META[s] })),
    ...CHAR_ATTRS.map((a) => ({ key: a as StatKey, ...ATTR_META[a] })),
  ]);

  const initials = $derived(
    (store.draft.firstName[0] ?? "") + (store.draft.lastName[0] ?? ""),
  );

  const startLabel = $derived.by(() => {
    if (!store.draft.firstName.trim() || !store.draft.lastName.trim()) return "Enter a name";
    if (store.sportPointsLeft < 0 || store.attrPointsLeft < 0) return "Over budget";
    return "Start career ▸";
  });
</script>

<div class="screen">
  <div class="head">
    <h1>Create your player</h1>
  </div>

  <div class="identity">
    <div class="avatar" class:f={store.draft.gender === "f"}>{initials}</div>
    <div class="who">
      <div class="nameline">
        <input
          class="name-input first"
          type="text"
          maxlength="20"
          placeholder="First name"
          value={store.draft.firstName}
          oninput={(e) => store.setFirstName(e.currentTarget.value)}
        />
        <input
          class="name-input"
          type="text"
          maxlength="20"
          placeholder="Last name"
          value={store.draft.lastName}
          oninput={(e) => store.setLastName(e.currentTarget.value)}
        />
        <button class="die" title="Random name" aria-label="Random name" onclick={() => store.rerollName()}>🎲</button>
      </div>
      <div class="sub">
        {age} years · {NATIONALITIES[store.draft.nationality]?.name} · {store.draft.gender === "m" ? "men" : "women"}
      </div>
    </div>
  </div>

  <div class="controls">
    <div class="gender">
      <button class:on={store.draft.gender === "m"} onclick={() => store.setGender("m")}>♂</button>
      <button class:on={store.draft.gender === "f"} onclick={() => store.setGender("f")}>♀</button>
    </div>
    <select value={store.draft.nationality} onchange={(e) => store.setNationality(e.currentTarget.value)}>
      {#each Object.entries(NATIONALITIES) as [code, n] (code)}
        <option value={code}>{n.name}</option>
      {/each}
    </select>
  </div>

  <div class="section-head">
    <span class="section-label">Rackets</span>
    <span class="points" class:done={store.sportPointsLeft === 0} class:over={store.sportPointsLeft < 0}>
      {store.sportPointsLeft} pts left
    </span>
  </div>
  <div class="stats">
    {#each rows.slice(0, 4) as row (row.key)}
      {@render statRow(row)}
    {/each}
  </div>

  <div class="section-head">
    <span class="section-label">Character</span>
    <span class="points" class:done={store.attrPointsLeft === 0} class:over={store.attrPointsLeft < 0}>
      {store.attrPointsLeft} pts left
    </span>
  </div>
  <div class="stats">
    {#each rows.slice(4) as row (row.key)}
      {@render statRow(row)}
    {/each}
  </div>

  {#if traits.length > 0}
    <div class="section-head">
      <span class="section-label">Traits</span>
    </div>
    <div class="traits">
      {#each traits as t (t.id)}
        <div class="trait trait-{t.tone}">
          <span class="trait-name">{t.name}</span>
          <span class="trait-desc">{t.description}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<footer>
  <button class="reroll" onclick={() => store.rerollCharacter()}>⟳ Reroll</button>
  <button class="start" disabled={!store.canStartCareer} onclick={() => store.startCareer()}>
    {startLabel}
  </button>
</footer>

{#snippet statRow(row: { key: StatKey; label: string; hint: string; color: string })}
  {@const value = statValue(store.draft, row.key)}
  {@const cost = nextRaiseCost(store.draft, row.key)}
  <div class="row">
    <span class="dot" style:background={row.color}></span>
    <div class="meta">
      <div class="labelline">
        <span class="label">{row.label}{#if row.hint}<span class="hint"> · {row.hint}</span>{/if}</span>
        <span class="value">{value}</span>
      </div>
      <div class="bar">
        <div class="fill" style:width="{(value / STAT_MAX) * 100}%" style:background={row.color}></div>
      </div>
    </div>
    <div class="steppers">
      <button aria-label="Lower {row.label}" disabled={!canLower(store.draft, row.key)} onclick={() => store.adjustStat(row.key, -1)}>−</button>
      <button
        class="raise"
        aria-label="Raise {row.label} — costs {cost} point{cost === 1 ? '' : 's'}"
        disabled={!canRaise(store.draft, row.key)}
        onclick={() => store.adjustStat(row.key, 1)}
      >
        +{#if cost > 1}<span class="stepcost">{cost}</span>{/if}
      </button>
    </div>
  </div>
{/snippet}

<style>
  .screen {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  h1 {
    font-size: 18px;
    font-weight: 700;
  }

  .points {
    font-size: 12px;
    font-weight: 600;
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--card-2);
    border: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
  }

  .points.done {
    color: var(--ok);
    border-color: var(--ok);
  }

  .points.over {
    color: var(--danger);
    border-color: var(--danger);
  }

  .identity {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
    font-weight: 700;
    flex: 0 0 auto;
    background: color-mix(in srgb, var(--tn) 32%, var(--card));
    color: var(--tn);
  }

  .avatar.f {
    background: color-mix(in srgb, var(--social) 32%, var(--card));
    color: var(--social);
  }

  .who {
    min-width: 0;
  }

  .nameline {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .name-input {
    font: inherit;
    font-size: 17px;
    font-weight: 700;
    color: var(--text);
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    padding: 0 0 1px;
    min-width: 0;
    width: 5.5em;
  }

  .name-input.first {
    width: 4.5em;
  }

  .name-input:focus {
    outline: none;
    border-bottom-color: var(--accent);
  }

  .name-input::placeholder {
    color: var(--muted);
    font-weight: 400;
  }

  .die {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    background: var(--card-2);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 14px;
  }

  .sub {
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
  }

  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 18px;
  }

  .gender {
    display: flex;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 2px;
    flex: 0 0 auto;
  }

  .gender button {
    padding: 6px 12px;
    border-radius: 7px;
    color: var(--muted);
    font-size: 15px;
  }

  .gender button.on {
    background: var(--accent);
    color: #fff;
  }

  select {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 9px;
    padding: 0 10px;
    font: inherit;
    font-size: 13px;
    height: 38px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .section-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .stats {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 18px;
  }

  .traits {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 18px;
  }

  .trait {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }

  .trait-name {
    font-weight: 700;
    font-size: 13px;
  }

  .trait-desc {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.35;
  }

  .trait-positive {
    background: color-mix(in srgb, var(--ok) 10%, var(--card));
    border-color: color-mix(in srgb, var(--ok) 35%, var(--border));
  }

  .trait-positive .trait-name {
    color: var(--ok);
  }

  .trait-negative {
    background: color-mix(in srgb, var(--danger) 10%, var(--card));
    border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
  }

  .trait-negative .trait-name {
    color: var(--danger);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    flex: 0 0 auto;
  }

  .meta {
    flex: 1;
    min-width: 0;
  }

  .labelline {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 3px;
  }

  .label {
    font-size: 13px;
  }

  .hint {
    color: var(--muted);
    font-size: 11px;
  }

  .value {
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    height: 5px;
    border-radius: 3px;
    background: var(--bg);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 3px;
  }

  .steppers {
    display: flex;
    gap: 4px;
    flex: 0 0 auto;
  }

  .steppers button {
    position: relative;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--card-2);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 16px;
    line-height: 1;
  }

  .steppers button:disabled {
    opacity: 0.3;
  }

  /* tiny cost badge on the raise button when a level costs more than 1 point
     — makes the progressive sport cost legible at the point of action */
  .stepcost {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    line-height: 14px;
    text-align: center;
  }

  .raise:disabled .stepcost {
    background: var(--muted);
  }

  footer {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 10px;
    padding: 10px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--card);
    border-top: 1px solid var(--border);
  }

  .reroll {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--card-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 12px;
    padding: 0 16px;
    height: 48px;
    font-size: 14px;
    font-weight: 600;
  }

  .start {
    flex: 1;
    background: var(--accent);
    color: #fff;
    border-radius: 12px;
    height: 48px;
    font-size: 16px;
    font-weight: 700;
  }

  .start:disabled {
    opacity: 0.45;
  }
</style>
