# The Pilgrim's Progress — 2D Parkour & Story Implementation Plan

This plan refines **Option A** into a **2D Graphic-Novel Parkour & Narrative Runner** in the style of *The Rogue Prince of Persia*, focusing on fluid acrobatic traversal—**wall climbing, wall jumping, wall sliding, ledge grabbing, and vaulting**—paired with **concise story dialogue encounters** from John Bunyan's book rather than generic combat.

## User Review & Critical Decisions

> [!IMPORTANT]
> This revision replaces generic combat with pure *Prince of Persia* parkour mechanics (wall-running/climbing, wall-jumping, ledge-grabbing, and obstacle vaulting) and weaves in short, impactful story dialogues with Bunyan's characters in every chapter. Click **Proceed** when you are ready to build, or let us know if you'd like any further tweaks!

- **Core Gameplay Focus (*Prince of Persia* Parkour)**:
  - **Wall Climbing (Wall Run Up)**: Hold jump/up against a vertical wall to scramble upward and mantle onto higher ledges.
  - **Wall Sliding & Wall Jumping**: Slide down vertical surfaces with controlled friction and kick off at a 45° angle to chain wall-to-wall jumps up narrow shafts and canyons.
  - **Ledge Grab & Vaulting**: Automatically catch ledge corners to pull up, and fluidly vault over low barriers without losing forward momentum.
- **Short Story Dialogue Encounters**: Each chapter features brief, atmospheric parchment dialogue boxes (2–3 lines per encounter in 17th-century typography) with iconic characters (*Evangelist*, *Help*, *Goodwill*, *The Interpreter*, *The Shining Ones*, *Charity*, *Apollyon*, and *Hopeful*) at the start, midpoint, or climax of the run.
- **Burden-to-Agility Parkour Evolution**:
  - **Chapters 1–5 (Burdened Parkour)**: Christian can still wall-climb, wall-jump, and ledge-grab, but the heavy Burden on his back limits his upward wall-climb height and pulls him down faster during wall-slides.
  - **Chapters 5–10 (Unburdened *Prince of Persia* Flow)**: Once the Burden falls off at the Cross in Chapter 5, Christian's wall-runs reach higher, his wall-jumps chain effortlessly, and his cloak billows with full acrobatic speed.

---

## 1. Overview & Core Concept

- **What It Does**: Turns each of the 10 chapters in the leather-bound book into a hand-inked 2D parkour stage with short narrative dialogues that bring Bunyan's allegory to life.
- **Target Audience / Persona**: Players who love kinetic, momentum-driven 2D parkour (*The Rogue Prince of Persia*, *Celeste*) combined with faithful literary storytelling.
- **Key Value**: Respects the spirit of *The Pilgrim's Progress*—Christian's journey is a perilous pilgrimage of endurance, navigation, and faith rather than a hack-and-slash brawler, with the sole confrontation against Apollyon in Chapter 8 playing out as an acrobatic survival & deflection sequence.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Book Menu to Chapter Launch**: Clicking *"Enter Chapter"* on any open chapter page zooms into the parchment and opens with a brief 2-line story dialogue setting the scene.
  2. **Parkour Controls**:
     - `A / D` or `Left / Right Arrows`: Sprint with momentum and lean into turns.
     - `W / Space / Up Arrow`:
       - **On Ground**: Jump (tap for hop, hold for full arc).
       - **Against a Wall (Holding Toward Wall)**: **Wall Climb / Wall Scramble** upward for a set stamina/height window.
       - **Against a Wall (Pressing Jump)**: **Wall Jump** — Kick off the wall to leap across to an opposite wall or higher platform.
       - **At a Ledge Corner**: **Ledge Grab & Mantle** up onto the platform.
     - `S / Down Arrow` or `Shift`: **Slide / Roll** under low hazards and crumble zones, or fast-drop down a wall.
     - `E`: **Advance Dialogue / Recall Scripture Verse** (illuminates hidden handholds, calms hazards, or answers an NPC).
  3. **Story Dialogue Moments**: Reaching an NPC (like *Evangelist* pointing toward the Wicket Gate or *Help* reaching out at the Slough) pauses hazards briefly and displays a crisp parchment dialogue banner at the bottom of the screen (`Press Space / Click to Continue`).

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Bold *Rogue Prince of Persia* graphic-novel animation—expressive ink outlines, flowing scarf/cloak trail that traces Christian's wall-jump arcs, and dust puffs when kicking off walls or grabbing ledges.
  - *Color Palette & Mood*:
    - `--background`: Dramatic cel-shaded parallax backdrops tailored to each chapter's mood.
    - `--primary`: Aged Parchment (`#F6E6B8`) and Deep Ink (`#0E0502`) for dialogue banners and Scripture callouts.
    - `--accent`: Guiding Light Gold (`#FDE047`) highlighting climbable wall Chalk/Striations, ledge-grab corners, and the Narrow Way.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Parkour & Evasion Over Combat**
  - *Chosen Approach*: Build the game engine around responsive 2D platforming physics (coyote time, jump buffering, wall-friction, wall-climb stamina, and ledge-snapping). Even in Chapter 8 (*Apollyon*), Christian overcomes Apollyon through agile wall-jumping over shockwaves, shielding fiery darts, and reaching high vantage points to drive him back with the Word.
  - *Why*: Matches the book faithfully (where Christian is a traveler on the King's Highway, not a mercenary fighting mobs) and keeps gameplay focused on tight, satisfying *Prince of Persia* movement.

- **Decision 2: Concise 2–3 Line Story Dialogues**
  - *Chosen Approach*: Keep each dialogue encounter to 2–3 impactful, readable exchanges written in accessible 17th-century-flavored prose so the story shines without interrupting the parkour flow with long text walls.
  - *Why*: Balances story immersion with fast-paced parkour momentum.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        App State & Audio Controller                       │
│   • View State: TABLETOP_BOOK | STAGE_PLAYING | DIALOGUE_OVERLAY          │
│   • Progression State: Completed Chapters (1..10), Active Chapter ID      │
└───────────────────┬───────────────────────────────────────┬───────────────┘
                    │                                       │
                    ▼                                       ▼
┌───────────────────────────────────────┐ ┌─────────────────────────────────┐
│       Interactive Tabletop Menu       │ │   2D Parkour & Story Engine     │
│  • WoodenTableBackground (Top-Left    │ │  • Pilgrim Parkour Physics:     │
│    Flickering Light)                  │ │    Run, Jump, Wall-Climb,       │
│  • LeatherBook (Chapters 1–10 +       │ │    Wall-Slide, Wall-Jump, Vault │
│    THE END Spread)                    │ │  • Story Dialogue Banner UI     │
│  • "Enter Chapter" Inked Trigger      │ │  • Chapter 1–10 Parkour Courses │
└───────────────────────────────────────┘ └─────────────────────────────────┘
```

### Chapter-by-Chapter Parkour & Dialogue Blueprint (Chapters 1–10)

| Chapter | Story Dialogue Encounter | *Prince of Persia* Parkour Course & Mechanics |
| :--- | :--- | :--- |
| **1. The City Of Destruction** | **Evangelist**: *"Fly from the wrath to come! Keep that shining light in thine eye, and go directly thereto."* | Vaulting crumbling stone walls, leaping across widening street fissures, and wall-climbing out of the sunken city gates under the weight of the Burden. |
| **2. The Slough Of Despond** | **Help**: *"Give me thine hand! Why didst thou not look for the steps that the King's laborers placed here?"* | Chaining precise jumps across sinking bog-pillars and wall-jumping up the muddy ravine walls using the *Steps of Promise* before sinking. |
| **3. The Wicket Gate** | **Goodwill**: *"We make no objections against any, notwithstanding all that they have done before they come hither."* | Sprinting past the falling boulders of Mount Sinai (after Worldly Wiseman's warning), sliding under arrow volleys, and wall-jumping up the gatehouse approach. |
| **4. The Interpreter's House** | **The Interpreter**: *"Come in; I will show thee that which will be profitable to thee on thy journey."* | Indoor vertical parkour across high library rafters, wall-climbing illuminated shafts revealed by the *Lamp Unto My Feet* pulse, and vaulting past the roaring fireplace. |
| **5. The Cross And The Burden** | **Three Shining Ones**: *"Peace be to thee; thy sins be forgiven thee... take this roll with a seal upon it."* | A grueling final burdened climb up the walled hill to the Cross; the Burden snaps off and tumbles into the tomb, immediately unlocking high-flying unburdened wall-runs and joyful leaps! |
| **6. Hill Difficulty** | **Timorous & Mistrust**: *"The further we go, the more danger we meet; yet Christian answered: 'I must venture!'"* | Pure vertical *Prince of Persia* cliff-parkour: chaining back-and-forth wall-jumps up steep rock chimneys, resting at the midway Arbor, and vaulting past the chained lions. |
| **7. Palace Beautiful** | **Piety, Prudence & Charity**: *"Come into the armory; let us harness thee from head to foot against assaults in the way."* | Acrobatic traversal across the palace's high bell-towers and colonnades, equipping the Shield of Faith (directional air-ward) and descending the precipitous valley stairs. |
| **8. The Valley Of Humiliation** | **Apollyon**: *"Prepare thyself to die; for I swear by my infernal den, thou shalt go no further!"* — **Christian**: *"Rejoice not against me, O mine enemy!"* | High-speed parkour boss survival: wall-running up canyon walls to dodge Apollyon's ground-slams, deflecting fiery darts mid-air with the Shield of Faith, and reaching three high altars of the Word to drive Apollyon away. |
| **9. The Valley Of The Shadow Of Death** | **Voice of a Fellow Pilgrim Ahead**: *"Yea, though I walk through the valley of the shadow of death, I will fear no evil!"* | Precision parkour along a razor-thin dark causeway: wall-jumping between pitch-black pillars illuminated only by the *Psalm 23:4* light pulse and timing leaps over flame-spouts. |
| **10. The Celestial City** | **Hopeful & The King's Heralds**: *"Be of good cheer, my brother; I feel the bottom, and it is good! Enter into the joy of thy Lord."* | Navigating the surging currents of the River of Death with Hopeful, followed by a soaring vertical wall-run and cloud-leap ascent up Mount Zion through the golden gates, unlocking **THE END**. |
