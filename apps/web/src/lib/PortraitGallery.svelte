<script lang="ts">
  import { onMount } from "svelte";
  import {
    defaultPortraitProvider,
    portraitSeedFor,
    type PortraitInput,
    type PortraitRecipe,
  } from "@racketlon/portraits";

  interface GalleryPerson {
    name: string;
    flag: string;
    country: string;
    age: number;
    gender: "m" | "f";
  }

  interface PortraitCard extends GalleryPerson {
    recipe: PortraitRecipe;
    svg: string;
  }

  const people: readonly GalleryPerson[] = [
    { name: "H. Hayashi", flag: "🇯🇵", country: "JP", age: 26, gender: "m" },
    { name: "E. Lindgren", flag: "🇸🇪", country: "SE", age: 25, gender: "f" },
    { name: "L. Müller", flag: "🇩🇪", country: "DE", age: 24, gender: "f" },
    { name: "A. Verma", flag: "🇮🇳", country: "IN", age: 28, gender: "m" },
    { name: "T. Dupont", flag: "🇫🇷", country: "FR", age: 26, gender: "m" },
    { name: "W. Li", flag: "🇨🇳", country: "CN", age: 25, gender: "f" },
    { name: "O. Wilson", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", country: "ENG", age: 27, gender: "m" },
    { name: "K. Nováková", flag: "🇨🇿", country: "CZ", age: 24, gender: "f" },
    { name: "M. Hansen", flag: "🇩🇰", country: "DK", age: 58, gender: "m" },
    { name: "G. Rossi", flag: "🇮🇹", country: "IT", age: 32, gender: "f" },
    { name: "J. Kowalski", flag: "🇵🇱", country: "PL", age: 41, gender: "m" },
    { name: "M. García", flag: "🇪🇸", country: "ES", age: 62, gender: "f" },
  ];

  function cardFor(person: GalleryPerson): PortraitCard {
    const playerId = `gallery:${person.name}:${person.country}`;
    const input: PortraitInput = {
      playerId,
      portraitSeed: portraitSeedFor(playerId),
      ageYears: person.age,
      gender: person.gender,
      country: person.country,
    };
    const recipe = defaultPortraitProvider.recipeFor(input);
    return {
      ...person,
      recipe,
      svg: defaultPortraitProvider.render?.(recipe) ?? "",
    };
  }

  const cards = people.map(cardFor);
  const agingAges = [16, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;
  const agingPlayerId = "gallery:aging:elin-lindgren";
  const agingCards = agingAges.map((age) => {
    const recipe = defaultPortraitProvider.recipeFor({
      playerId: agingPlayerId,
      portraitSeed: portraitSeedFor(agingPlayerId),
      ageYears: age,
      gender: "f",
      country: "SE",
    });
    return { age, svg: defaultPortraitProvider.render?.(recipe) ?? "", recipe };
  });

  onMount(() => {
    document.body.classList.add("portrait-debug");
    return () => document.body.classList.remove("portrait-debug");
  });
</script>

<main class="portrait-gallery">
  <header>
    <p class="eyebrow">@racketlon/portraits · recipe v1 · 96×96 pixel renderer</p>
    <h1>Procedural portrait gallery</h1>
    <p class="intro">
      These faces are rendered live from deterministic recipes. Reloading the page produces the same portraits.
    </p>
  </header>

  <section>
    <div class="section-heading">
      <div>
        <p class="kicker">One identity over time</p>
        <h2>Age progression</h2>
      </div>
      <span class="shirt-note">Swedish national shirt palette</span>
    </div>
    <div class="aging-grid">
      {#each agingCards as card}
        <article class="age-card">
          <div class="portrait">{@html card.svg}</div>
          <strong>{card.age}</strong><span>years</span>
        </article>
      {/each}
    </div>
  </section>

  <section>
    <div class="section-heading">
      <div>
        <p class="kicker">Stable seeds, varied recipes</p>
        <h2>International player pool</h2>
      </div>
      <span class="shirt-note">Shirts use national colors</span>
    </div>
    <div class="player-grid">
      {#each cards as card}
        <article class="player-card">
          <div class="portrait large">{@html card.svg}</div>
          <div class="card-copy">
            <div class="identity"><span>{card.flag}</span><strong>{card.name}</strong></div>
            <p>{card.country} · {card.age} years</p>
            <dl>
              <div><dt>Hair</dt><dd>{card.recipe.hair}</dd></div>
              <div><dt>Eyes</dt><dd>{card.recipe.eyes}</dd></div>
              <div><dt>Shirt</dt><dd>{card.recipe.shirtPalette.replace("country-", "")}</dd></div>
            </dl>
          </div>
        </article>
      {/each}
    </div>
  </section>

  <footer>
    Recipe generation and rendering are separate adapters. This gallery uses the default provider; another renderer
    can replace SVG without changing player or simulation data.
  </footer>
</main>

<style>
  :global(body.portrait-debug) {
    min-width: 320px;
    background:
      radial-gradient(circle at 15% 0%, rgba(27, 120, 151, 0.22), transparent 35%),
      #0b1118;
  }

  :global(body.portrait-debug #app) {
    max-width: none;
    width: 100%;
    height: auto;
    min-height: 100dvh;
    display: block;
  }

  .portrait-gallery {
    width: min(1440px, 100%);
    margin: 0 auto;
    padding: 52px clamp(18px, 4vw, 64px) 64px;
    color: #edf3f5;
  }

  header {
    max-width: 760px;
    margin-bottom: 44px;
  }

  .eyebrow,
  .kicker {
    margin: 0 0 8px;
    color: #65d1cb;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h1 {
    font-size: clamp(36px, 6vw, 72px);
    line-height: 0.98;
    letter-spacing: -0.04em;
  }

  .intro {
    max-width: 650px;
    margin: 20px 0 0;
    color: #aab9c2;
    font-size: clamp(16px, 2vw, 20px);
    line-height: 1.55;
  }

  section {
    margin-top: 42px;
    padding: clamp(18px, 3vw, 32px);
    border: 1px solid #2b3a44;
    border-radius: 20px;
    background: rgba(19, 28, 36, 0.88);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.24);
  }

  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 22px;
  }

  h2 {
    font-size: clamp(24px, 3vw, 36px);
    letter-spacing: -0.025em;
  }

  .shirt-note {
    padding: 8px 12px;
    border: 1px solid #405461;
    border-radius: 999px;
    color: #c4d0d5;
    font-size: 12px;
  }

  .aging-grid {
    display: grid;
    grid-template-columns: repeat(10, minmax(78px, 1fr));
    gap: 8px;
  }

  .age-card,
  .player-card {
    overflow: hidden;
    border: 1px solid #30414c;
    border-radius: 12px;
    background: #121b23;
  }

  .age-card {
    padding-bottom: 10px;
    text-align: center;
  }

  .age-card strong {
    display: block;
    margin-top: 8px;
    font-size: 15px;
  }

  .age-card span {
    color: #7f929d;
    font-size: 11px;
  }

  .portrait {
    overflow: hidden;
    aspect-ratio: 1;
    background: #78909c;
  }

  .portrait :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }

  .player-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .player-card {
    display: grid;
    grid-template-columns: minmax(96px, 42%) 1fr;
  }

  .portrait.large {
    min-height: 100%;
    border-right: 1px solid #30414c;
  }

  .card-copy {
    min-width: 0;
    padding: 14px;
  }

  .identity {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .identity span {
    font-size: 20px;
  }

  .identity strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-copy > p {
    margin: 5px 0 12px;
    color: #82949f;
    font-size: 12px;
  }

  dl {
    display: grid;
    gap: 5px;
    margin: 0;
    font-size: 11px;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  dt {
    color: #73858f;
  }

  dd {
    overflow: hidden;
    margin: 0;
    color: #c6d0d5;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  footer {
    max-width: 780px;
    margin: 30px auto 0;
    color: #788b96;
    font-size: 13px;
    line-height: 1.6;
    text-align: center;
  }

  @media (max-width: 1050px) {
    .aging-grid {
      grid-template-columns: repeat(5, 1fr);
    }

    .player-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    .portrait-gallery {
      padding-top: 30px;
    }

    .section-heading {
      align-items: start;
      flex-direction: column;
    }

    .aging-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .player-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
