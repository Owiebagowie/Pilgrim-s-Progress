export interface PlatformRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * 'solid' = standard stone/wood platform & climbable wall
   * 'sinking' = Slough bog pillar that slowly sinks when stood upon
   * 'promise' = semi-translucent golden platform solidified by Scripture Pulse (E)
   * 'vault' = low hurdle Christian can cleanly vault over for a speed boost
   */
  type?: 'solid' | 'sinking' | 'promise' | 'vault';
}

export interface StageHazard {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'embers' | 'mire' | 'arrows' | 'flame_jet' | 'apollyon_dart' | 'shadow_pit' | 'river_current';
  /** Optional oscillation speed/range for moving hazards */
  speed?: number;
  range?: number;
}

export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface StageNPC {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  cloakColor: string;
  accentColor: string;
  /** If true, triggers automatically once when Christian runs past x */
  autoTrigger?: boolean;
  /** If true, reaching this NPC/landmark unburdens Christian (Chapter 5 Cross) */
  triggersUnburden?: boolean;
  dialogue: DialogueLine[];
}

export interface ChapterConfig {
  id: number;
  title: string;
  summary: string;
  verse: string;
  reference: string;
  startsBurdened: boolean;
  hasArmor: boolean;
  darknessLevel?: number;
  goalX: number;
  goalY: number;
  goalLabel: string;
  palette: {
    skyTop: string;
    skyBottom: string;
    distantSilhouette: string;
    midSilhouette: string;
    platformFill: string;
    platformTop: string;
    accentGlow: string;
  };
  platforms: PlatformRect[];
  hazards: StageHazard[];
  npcs: StageNPC[];
}

export const CHAPTERS: Record<number, ChapterConfig> = {
  1: {
    id: 1,
    title: 'The City Of Destruction',
    summary:
      'Christian learns of the coming judgment and leaves his old life in search of the Celestial City.',
    verse:
      'Come unto me, all ye that labour and are heavy laden, and I will give you rest.',
    reference: 'Matthew 11:28',
    startsBurdened: true,
    hasArmor: false,
    goalX: 2780,
    goalY: 320,
    goalLabel: 'The Plain of Escape',
    palette: {
      skyTop: '#240907',
      skyBottom: '#6E1D14',
      distantSilhouette: '#3A0E0A',
      midSilhouette: '#1F0705',
      platformFill: '#331510',
      platformTop: '#B4532A',
      accentGlow: '#F59E0B',
    },
    platforms: [
      // Starting street in the crumbling city
      { x: 0, y: 480, w: 620, h: 160, type: 'solid' },
      // Low rubble hurdle to vault
      { x: 360, y: 432, w: 46, h: 48, type: 'vault' },
      // First street fissure jump
      { x: 710, y: 460, w: 380, h: 180, type: 'solid' },
      // Vertical stone wall to wall-climb up
      { x: 980, y: 330, w: 110, h: 150, type: 'solid' },
      // Upper rooftop run
      { x: 1170, y: 310, w: 410, h: 40, type: 'solid' },
      { x: 1350, y: 262, w: 44, h: 48, type: 'vault' },
      // Wall-jump chimney shaft (two facing walls)
      { x: 1660, y: 180, w: 60, h: 340, type: 'solid' },
      { x: 1860, y: 120, w: 65, h: 400, type: 'solid' },
      // High city battlement & descent
      { x: 1860, y: 120, w: 340, h: 45, type: 'solid' },
      { x: 2290, y: 240, w: 220, h: 40, type: 'solid' },
      // Final plain outside the city gates
      { x: 2560, y: 320, w: 440, h: 260, type: 'solid' },
    ],
    hazards: [
      { x: 620, y: 550, w: 90, h: 60, kind: 'embers' },
      { x: 1090, y: 550, w: 570, h: 60, kind: 'embers' },
      { x: 2200, y: 550, w: 360, h: 60, kind: 'embers' },
    ],
    npcs: [
      {
        id: 'evangelist-1',
        name: 'Evangelist',
        role: 'Messenger of the King',
        x: 190,
        y: 480,
        cloakColor: '#1E3A8A',
        accentColor: '#FDE047',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Christian',
            text: 'Woe is me! This heavy burden upon my back sinketh me down, and our city is appointed to destruction!',
          },
          {
            speaker: 'Evangelist',
            text: 'Fly from the wrath to come! Do you see yonder shining light? Keep that light in thine eye, and run directly thereto.',
          },
        ],
      },
      {
        id: 'obstinate-1',
        name: 'Obstinate',
        role: 'Neighbor of the City',
        x: 840,
        y: 460,
        cloakColor: '#7F1D1D',
        accentColor: '#FCA5A5',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Obstinate',
            text: 'Turn back, Christian! Leave not thy comforts and friends behind for an uncertain flight!',
          },
          {
            speaker: 'Christian',
            text: 'That which you forsake is not worthy to be compared with a little of that which I seek to enjoy!',
          },
        ],
      },
    ],
  },

  2: {
    id: 2,
    title: 'The Slough Of Despond',
    summary:
      'Overwhelmed by guilt and fear, Christian falls into the Slough of Despond and struggles to continue his journey.',
    verse:
      'Why art thou cast down, O my soul? and why art thou disquieted within me? hope thou in God.',
    reference: 'Psalm 42:11',
    startsBurdened: true,
    hasArmor: false,
    goalX: 2820,
    goalY: 360,
    goalLabel: 'Solid Ground Beyond the Mire',
    palette: {
      skyTop: '#111C18',
      skyBottom: '#2F483E',
      distantSilhouette: '#192923',
      midSilhouette: '#0F1A16',
      platformFill: '#233129',
      platformTop: '#65A30D',
      accentGlow: '#FDE047',
    },
    platforms: [
      { x: 0, y: 450, w: 440, h: 180, type: 'solid' },
      // Sinking bog pillars & Steps of Promise (press E to solidify/illuminate!)
      { x: 520, y: 465, w: 120, h: 32, type: 'sinking' },
      { x: 710, y: 440, w: 115, h: 28, type: 'promise' },
      { x: 900, y: 460, w: 120, h: 32, type: 'sinking' },
      { x: 1090, y: 420, w: 115, h: 28, type: 'promise' },
      // Muddy ravine wall-jump shaft
      { x: 1280, y: 260, w: 70, h: 320, type: 'solid' },
      { x: 1470, y: 200, w: 70, h: 380, type: 'solid' },
      { x: 1470, y: 200, w: 280, h: 42, type: 'solid' },
      // Second wide mire crossing
      { x: 1830, y: 310, w: 125, h: 32, type: 'sinking' },
      { x: 2030, y: 290, w: 120, h: 28, type: 'promise' },
      { x: 2230, y: 330, w: 125, h: 32, type: 'sinking' },
      // Bank where Help stands
      { x: 2440, y: 360, w: 560, h: 240, type: 'solid' },
    ],
    hazards: [
      { x: 440, y: 535, w: 840, h: 80, kind: 'mire' },
      { x: 1750, y: 535, w: 690, h: 80, kind: 'mire' },
    ],
    npcs: [
      {
        id: 'pliable-2',
        name: 'Pliable',
        role: 'Faint-Hearted Companion',
        x: 310,
        y: 450,
        cloakColor: '#78350F',
        accentColor: '#FCD34D',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Pliable',
            text: 'Is this the happiness you told me all this while of? If I can get out with my life, you shall possess the brave country alone!',
          },
          {
            speaker: 'Christian',
            text: 'Though I sink in the mire under my burden, press [E] to recall God’s Word and reveal the Steps of Promise across the Slough!',
          },
        ],
      },
      {
        id: 'help-2',
        name: 'Help',
        role: 'Servant of the Lawgiver',
        x: 2540,
        y: 360,
        cloakColor: '#065F46',
        accentColor: '#FEF08A',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Help',
            text: 'Give me thine hand! These steps were placed here by directions of the Lawgiver, that the weather might not make this place impassable.',
          },
          {
            speaker: 'Christian',
            text: 'Fear pressed me so hard that I fled the next way and fell in; blessed be thy hand that set me upon sound ground!',
          },
        ],
      },
    ],
  },

  3: {
    id: 3,
    title: 'The Wicket Gate',
    summary:
      'Christian ignores worldly advice and reaches the Wicket Gate, where he is welcomed onto the path of life.',
    verse: 'Enter ye in at the strait gate.',
    reference: 'Matthew 7:13',
    startsBurdened: true,
    hasArmor: false,
    goalX: 2860,
    goalY: 250,
    goalLabel: 'The Strait Wicket Gate',
    palette: {
      skyTop: '#1E1B4B',
      skyBottom: '#5B21B6',
      distantSilhouette: '#2E1065',
      midSilhouette: '#170B3B',
      platformFill: '#271745',
      platformTop: '#C084FC',
      accentGlow: '#FBBF24',
    },
    platforms: [
      { x: 0, y: 470, w: 580, h: 160, type: 'solid' },
      { x: 350, y: 422, w: 48, h: 48, type: 'vault' },
      // Crags of Mount Sinai overhang
      { x: 660, y: 430, w: 360, h: 190, type: 'solid' },
      { x: 910, y: 290, w: 110, h: 140, type: 'solid' },
      // Fast parkour sprint across battlements under arrow fire
      { x: 1100, y: 300, w: 460, h: 40, type: 'solid' },
      { x: 1310, y: 252, w: 45, h: 48, type: 'vault' },
      { x: 1650, y: 340, w: 380, h: 40, type: 'solid' },
      { x: 1840, y: 292, w: 45, h: 48, type: 'vault' },
      // Wall-jump tower leading up to the Wicket Gate
      { x: 2110, y: 180, w: 65, h: 360, type: 'solid' },
      { x: 2300, y: 130, w: 65, h: 410, type: 'solid' },
      { x: 2300, y: 250, w: 720, h: 320, type: 'solid' },
    ],
    hazards: [
      { x: 1200, y: 220, w: 28, h: 12, kind: 'arrows', speed: 6, range: 350 },
      { x: 1750, y: 260, w: 28, h: 12, kind: 'arrows', speed: 7, range: 350 },
    ],
    npcs: [
      {
        id: 'worldly-3',
        name: 'Mr. Worldly Wiseman',
        role: 'Dwellers of Carnal Policy',
        x: 220,
        y: 470,
        cloakColor: '#581C87',
        accentColor: '#E9D5FF',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Mr. Worldly Wiseman',
            text: 'Why seekest thou relief by such a dangerous way? Turn aside to the village of Morality where Mr. Legality dwells!',
          },
          {
            speaker: 'Christian',
            text: 'Mount Sinai flashes with fire above that path! I must press on toward the Strait Gate before the arrows overtake me!',
          },
        ],
      },
      {
        id: 'goodwill-3',
        name: 'Goodwill',
        role: 'Keeper of the Wicket Gate',
        x: 2680,
        y: 250,
        cloakColor: '#B45309',
        accentColor: '#FEF08A',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Goodwill',
            text: 'I am willing with all my heart! Step in quickly, for Beelzebub and his captains shoot fiery darts at those who knock here.',
          },
          {
            speaker: 'Goodwill',
            text: 'Look before thee: dost thou see this narrow way? It was cast up by the patriarchs, prophets, Christ, and his apostles—keep straight thereon.',
          },
        ],
      },
    ],
  },

  4: {
    id: 4,
    title: "The Interpreter's House",
    summary:
      'Christian receives important lessons that teach him about faith, obedience, and the Christian life.',
    verse: 'Thy word is a lamp unto my feet, and a light unto my path.',
    reference: 'Psalm 119:105',
    startsBurdened: true,
    hasArmor: false,
    goalX: 2780,
    goalY: 220,
    goalLabel: 'The Highway of Light',
    palette: {
      skyTop: '#1C110A',
      skyBottom: '#572811',
      distantSilhouette: '#2E160A',
      midSilhouette: '#170B05',
      platformFill: '#3B1B0C',
      platformTop: '#F59E0B',
      accentGlow: '#FEF08A',
    },
    platforms: [
      { x: 0, y: 470, w: 500, h: 160, type: 'solid' },
      // Illuminated rafters (revealed by Lamp Unto My Feet pulse 'E')
      { x: 580, y: 400, w: 140, h: 28, type: 'promise' },
      { x: 800, y: 330, w: 140, h: 28, type: 'promise' },
      { x: 1020, y: 330, w: 420, h: 160, type: 'solid' },
      // The Fire of Grace gallery wall-climb
      { x: 1330, y: 190, w: 110, h: 140, type: 'solid' },
      { x: 1530, y: 210, w: 400, h: 40, type: 'solid' },
      // Second library shaft (wall-jump chimney)
      { x: 2010, y: 140, w: 60, h: 380, type: 'solid' },
      { x: 2200, y: 90, w: 60, h: 430, type: 'solid' },
      { x: 2200, y: 220, w: 740, h: 340, type: 'solid' },
    ],
    hazards: [
      { x: 1160, y: 270, w: 38, h: 60, kind: 'flame_jet' },
      { x: 1710, y: 150, w: 38, h: 60, kind: 'flame_jet' },
    ],
    npcs: [
      {
        id: 'interpreter-4a',
        name: 'The Interpreter',
        role: 'Guide of the House',
        x: 220,
        y: 470,
        cloakColor: '#92400E',
        accentColor: '#FEF08A',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'The Interpreter',
            text: 'Come in; I will show thee that which will be profitable to thee. Command my servant to light the candle!',
          },
          {
            speaker: 'The Interpreter',
            text: 'Press [E] to shine the Lamp of the Word—it will reveal the unseen rafters across the dusty hall.',
          },
        ],
      },
      {
        id: 'interpreter-4b',
        name: 'The Interpreter',
        role: 'The Room of the Fire of Grace',
        x: 2480,
        y: 220,
        cloakColor: '#92400E',
        accentColor: '#FEF08A',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'The Interpreter',
            text: 'Thou sawest the fire burning higher despite the water cast upon it—for Christ continually maintains the work of grace in the heart with the oil of His grace.',
          },
          {
            speaker: 'Christian',
            text: 'I have seen things rare and profitable; let me now go hence onto the walled way toward the Cross!',
          },
        ],
      },
    ],
  },

  5: {
    id: 5,
    title: 'The Cross And The Burden',
    summary:
      'Christian arrives at the Cross, where his burden finally falls from his back and rolls away forever.',
    verse: 'Looking unto Jesus the author and finisher of our faith.',
    reference: 'Hebrews 12:2',
    startsBurdened: true,
    hasArmor: false,
    goalX: 2920,
    goalY: 180,
    goalLabel: 'The Way Beyond Calvary',
    palette: {
      skyTop: '#451A03',
      skyBottom: '#D97706',
      distantSilhouette: '#78350F',
      midSilhouette: '#451A03',
      platformFill: '#3D1908',
      platformTop: '#FBBF24',
      accentGlow: '#FEF08A',
    },
    platforms: [
      // Steep uphill climb under the Burden
      { x: 0, y: 500, w: 460, h: 150, type: 'solid' },
      { x: 460, y: 440, w: 340, h: 210, type: 'solid' },
      { x: 800, y: 370, w: 340, h: 280, type: 'solid' },
      { x: 1140, y: 300, w: 580, h: 350, type: 'solid' },
      // After the Cross (x=1480): high-flying UNBURDENED Prince of Persia parkour!
      { x: 1860, y: 240, w: 240, h: 36, type: 'solid' },
      // Tall celebratory wall-jump canyon now easily reachable without the Burden
      { x: 2220, y: 80, w: 60, h: 460, type: 'solid' },
      { x: 2430, y: 40, w: 60, h: 500, type: 'solid' },
      { x: 2430, y: 180, w: 650, h: 380, type: 'solid' },
    ],
    hazards: [],
    npcs: [
      {
        id: 'cross-shining-5',
        name: 'The Three Shining Ones',
        role: 'At the Foot of the Cross',
        x: 1440,
        y: 300,
        cloakColor: '#FDE047',
        accentColor: '#FFFFFF',
        autoTrigger: true,
        triggersUnburden: true,
        dialogue: [
          {
            speaker: 'Christian',
            text: 'As I stood looking upon the Cross, the strings upon my shoulders cracked—and my heavy Burden fell off my back and tumbled into the sepulcher, to be seen no more!',
          },
          {
            speaker: 'The Three Shining Ones',
            text: 'Peace be to thee! Thy sins be forgiven thee. Take this new raiment and this sealed roll—now leap for joy with unburdened speed!',
          },
        ],
      },
    ],
  },

  6: {
    id: 6,
    title: 'Hill Difficulty',
    summary:
      'Christian must persevere through a steep and challenging climb while others choose easier paths.',
    verse: 'Let us run with patience the race that is set before us.',
    reference: 'Hebrews 12:1',
    startsBurdened: false,
    hasArmor: false,
    goalX: 2860,
    goalY: 130,
    goalLabel: 'The Summit & Porter’s Lodge',
    palette: {
      skyTop: '#0F172A',
      skyBottom: '#334155',
      distantSilhouette: '#1E293B',
      midSilhouette: '#0F172A',
      platformFill: '#1E293B',
      platformTop: '#38BDF8',
      accentGlow: '#FDE047',
    },
    platforms: [
      // Base of the Hill & Spring of Life
      { x: 0, y: 490, w: 520, h: 150, type: 'solid' },
      // Vertical cliffside wall-jump chimney 1
      { x: 580, y: 220, w: 65, h: 380, type: 'solid' },
      { x: 780, y: 160, w: 65, h: 440, type: 'solid' },
      // Midway Arbor rest plateau
      { x: 780, y: 260, w: 480, h: 45, type: 'solid' },
      // High cliff parkour & hurdles
      { x: 1370, y: 230, w: 420, h: 40, type: 'solid' },
      { x: 1560, y: 182, w: 45, h: 48, type: 'vault' },
      // Second vertical cliff chimney to summit
      { x: 1900, y: 90, w: 65, h: 450, type: 'solid' },
      { x: 2110, y: 50, w: 65, h: 490, type: 'solid' },
      { x: 2110, y: 130, w: 920, h: 420, type: 'solid' },
    ],
    hazards: [],
    npcs: [
      {
        id: 'arbor-6',
        name: 'The Pleasant Arbor',
        role: 'Midway Up Hill Difficulty',
        x: 1020,
        y: 260,
        cloakColor: '#0284C7',
        accentColor: '#FEF08A',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Christian',
            text: 'HowRefreshing is this Arbor made by the Lord of the Hill for weary travelers! Let me keep my sealed roll safe in my bosom and press upward.',
          },
        ],
      },
      {
        id: 'timorous-6',
        name: 'Timorous & Mistrust',
        role: 'Fleeing Down the Hill',
        x: 2350,
        y: 130,
        cloakColor: '#64748B',
        accentColor: '#CBD5E1',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Timorous',
            text: 'Turn back! Just ahead in the narrow passage lie two fierce lions waking in the way!',
          },
          {
            speaker: 'Watchful the Porter',
            text: 'Fear not the lions, Christian; they are chained, and are placed there for trial of faith. Keep in the midst of the path, and no hurt shall come unto thee.',
          },
        ],
      },
    ],
  },

  7: {
    id: 7,
    title: 'Palace Beautiful',
    summary:
      'Christian finds rest, encouragement, and new armor from fellow believers before continuing onward.',
    verse: 'Put on the whole armour of God.',
    reference: 'Ephesians 6:11',
    startsBurdened: false,
    hasArmor: true,
    goalX: 2820,
    goalY: 280,
    goalLabel: 'The Descent to the Valley',
    palette: {
      skyTop: '#1E1B4B',
      skyBottom: '#7C2D12',
      distantSilhouette: '#312E81',
      midSilhouette: '#1E1B4B',
      platformFill: '#2E1065',
      platformTop: '#F59E0B',
      accentGlow: '#FEF08A',
    },
    platforms: [
      { x: 0, y: 440, w: 620, h: 180, type: 'solid' },
      // Palace colonnades & high bell-tower wall-jumps
      { x: 720, y: 360, w: 320, h: 40, type: 'solid' },
      { x: 860, y: 312, w: 44, h: 48, type: 'vault' },
      { x: 1140, y: 140, w: 65, h: 400, type: 'solid' },
      { x: 1340, y: 90, w: 65, h: 450, type: 'solid' },
      // High Armory Terrace
      { x: 1340, y: 190, w: 620, h: 45, type: 'solid' },
      // Stepped descent down the Delectable Terrace
      { x: 2080, y: 240, w: 280, h: 40, type: 'solid' },
      { x: 2460, y: 280, w: 540, h: 300, type: 'solid' },
    ],
    hazards: [],
    npcs: [
      {
        id: 'piety-7',
        name: 'Piety, Prudence & Charity',
        role: 'Sisters of Palace Beautiful',
        x: 280,
        y: 440,
        cloakColor: '#B45309',
        accentColor: '#FEF08A',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Charity',
            text: 'Come in, thou blessed of the Lord! This house was built by the Lord of the Hill for the relief and security of pilgrims.',
          },
          {
            speaker: 'Prudence',
            text: 'Ascend to the Armory above—there shalt thou be harnessed from head to foot with proof against all assaults in the way.',
          },
        ],
      },
      {
        id: 'discretion-7',
        name: 'Discretion',
        role: 'Keeper of the Armory',
        x: 1620,
        y: 190,
        cloakColor: '#D97706',
        accentColor: '#FFFFFF',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Discretion',
            text: 'Behold thy Sword, Shield of Faith, Helmet, and Breastplate! Press [E] to raise thy Shield of Faith and ward off fiery darts in the Valley below.',
          },
        ],
      },
    ],
  },

  8: {
    id: 8,
    title: 'The Valley Of Humiliation',
    summary:
      'Christian confronts Apollyon, a fierce enemy who seeks to turn him away from his journey.',
    verse: 'Resist the devil, and he will flee from you.',
    reference: 'James 4:7',
    startsBurdened: false,
    hasArmor: true,
    goalX: 2880,
    goalY: 260,
    goalLabel: 'Victory Over Apollyon',
    palette: {
      skyTop: '#1F0808',
      skyBottom: '#4C1D1D',
      distantSilhouette: '#2D0A0A',
      midSilhouette: '#180505',
      platformFill: '#290D0D',
      platformTop: '#EF4444',
      accentGlow: '#FBBF24',
    },
    platforms: [
      { x: 0, y: 460, w: 560, h: 160, type: 'solid' },
      { x: 380, y: 412, w: 46, h: 48, type: 'vault' },
      // Canyon pillars & wall-climb evasions against Apollyon's fiery darts
      { x: 680, y: 420, w: 380, h: 180, type: 'solid' },
      { x: 950, y: 270, w: 110, h: 150, type: 'solid' },
      { x: 1160, y: 280, w: 420, h: 40, type: 'solid' },
      { x: 1360, y: 232, w: 46, h: 48, type: 'vault' },
      // High canyon chimney out of the fire pit
      { x: 1680, y: 160, w: 65, h: 380, type: 'solid' },
      { x: 1880, y: 110, w: 65, h: 430, type: 'solid' },
      { x: 1880, y: 260, w: 440, h: 42, type: 'solid' },
      { x: 2420, y: 260, w: 640, h: 340, type: 'solid' },
    ],
    hazards: [
      { x: 850, y: 340, w: 32, h: 14, kind: 'apollyon_dart', speed: 7.5, range: 420 },
      { x: 1420, y: 200, w: 32, h: 14, kind: 'apollyon_dart', speed: 8.5, range: 450 },
      { x: 2150, y: 180, w: 32, h: 14, kind: 'apollyon_dart', speed: 9.0, range: 450 },
    ],
    npcs: [
      {
        id: 'apollyon-8a',
        name: 'Apollyon',
        role: 'Destroyer across the Way',
        x: 240,
        y: 460,
        cloakColor: '#991B1B',
        accentColor: '#EF4444',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Apollyon',
            text: 'Whence comest thou? Thou art one of my subjects—prepare thyself to die, for I swear thou shalt go no further!',
          },
          {
            speaker: 'Christian',
            text: 'I have given Check to thy service, and have pledged my allegiance to the King of Princes! (Vault, wall-jump, or pulse [E] to deflect his darts!)',
          },
        ],
      },
      {
        id: 'apollyon-8b',
        name: 'Apollyon Driven Back',
        role: 'Triumph of the Word',
        x: 2560,
        y: 260,
        cloakColor: '#D97706',
        accentColor: '#FEF08A',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Christian',
            text: 'Rejoice not against me, O mine enemy: when I fall, I shall arise! In all these things we are more than conquerors through Him that loved us!',
          },
          {
            speaker: 'Narrator',
            text: 'With that, Apollyon spread forth his dragon’s wings and sped away, and a hand with leaves from the Tree of Life refreshed Christian.',
          },
        ],
      },
    ],
  },

  9: {
    id: 9,
    title: 'The Valley Of The Shadow Of Death',
    summary:
      'Christian travels through a terrifying valley filled with darkness, danger, and fear, trusting God to guide him.',
    verse:
      'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.',
    reference: 'Psalm 23:4',
    startsBurdened: false,
    hasArmor: true,
    darknessLevel: 0.86,
    goalX: 2860,
    goalY: 220,
    goalLabel: 'The Breaking of the Day',
    palette: {
      skyTop: '#05030A',
      skyBottom: '#1E1035',
      distantSilhouette: '#0F071E',
      midSilhouette: '#080410',
      platformFill: '#170E29',
      platformTop: '#A855F7',
      accentGlow: '#FDE047',
    },
    platforms: [
      { x: 0, y: 460, w: 460, h: 160, type: 'solid' },
      // Narrow causeway & unseen shadow ledges (press E to shine Psalm 23:4 light!)
      { x: 560, y: 420, w: 160, h: 30, type: 'promise' },
      { x: 820, y: 370, w: 160, h: 30, type: 'promise' },
      { x: 1080, y: 370, w: 360, h: 40, type: 'solid' },
      // Pitch-black vertical shaft
      { x: 1540, y: 150, w: 60, h: 390, type: 'solid' },
      { x: 1740, y: 100, w: 60, h: 440, type: 'solid' },
      { x: 1740, y: 240, w: 340, h: 38, type: 'solid' },
      { x: 2180, y: 220, w: 170, h: 30, type: 'promise' },
      { x: 2450, y: 220, w: 580, h: 360, type: 'solid' },
    ],
    hazards: [
      { x: 460, y: 550, w: 1080, h: 70, kind: 'shadow_pit' },
      { x: 1240, y: 310, w: 36, h: 60, kind: 'flame_jet' },
      { x: 1800, y: 550, w: 650, h: 70, kind: 'shadow_pit' },
    ],
    npcs: [
      {
        id: 'pilgrim-voice-9a',
        name: 'Faithful Ahead in the Dark',
        role: 'Voice in the Valley',
        x: 210,
        y: 460,
        cloakColor: '#6D28D9',
        accentColor: '#FEF08A',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Christian',
            text: 'A deep ditch lies on the right hand and a dangerous quag on the left! Press [E] to speak Psalm 23:4 and illuminate the dark causeway ahead!',
          },
        ],
      },
      {
        id: 'pilgrim-voice-9b',
        name: 'Faithful',
        role: 'At the Turning of the Morning',
        x: 2620,
        y: 220,
        cloakColor: '#F59E0B',
        accentColor: '#FEF08A',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Voice Ahead',
            text: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me!',
          },
          {
            speaker: 'Christian',
            text: 'He hath turned the shadow of death into the morning! Look how the sun rises upon the remaining way!',
          },
        ],
      },
    ],
  },

  10: {
    id: 10,
    title: 'The Celestial City',
    summary:
      'After crossing the River of Death, Christian and Hopeful are welcomed into the Celestial City. Their long journey comes to an end as they enter the presence of the King and receive their eternal reward.',
    verse:
      'Well done, thou good and faithful servant: thou hast been faithful over a few things, I will make thee ruler over many things: enter thou into the joy of thy lord.',
    reference: 'Matthew 25:21',
    startsBurdened: false,
    hasArmor: true,
    goalX: 2940,
    goalY: 110,
    goalLabel: 'The Gates of the Celestial City',
    palette: {
      skyTop: '#78350F',
      skyBottom: '#FDE047',
      distantSilhouette: '#B45309',
      midSilhouette: '#92400E',
      platformFill: '#78350F',
      platformTop: '#FEF08A',
      accentGlow: '#FFFFFF',
    },
    platforms: [
      // Bank of the River of Death
      { x: 0, y: 470, w: 480, h: 160, type: 'solid' },
      // River stones & Faith platforms across the River
      { x: 560, y: 460, w: 135, h: 30, type: 'sinking' },
      { x: 770, y: 430, w: 135, h: 28, type: 'promise' },
      { x: 980, y: 450, w: 135, h: 30, type: 'sinking' },
      { x: 1190, y: 410, w: 140, h: 28, type: 'promise' },
      // Further bank of Mount Zion
      { x: 1410, y: 390, w: 380, h: 220, type: 'solid' },
      // Soaring Mount Zion Golden Ascent (Wall-Jump Pillars of Glory)
      { x: 1890, y: 120, w: 65, h: 440, type: 'solid' },
      { x: 2100, y: 60, w: 65, h: 500, type: 'solid' },
      { x: 2100, y: 200, w: 320, h: 40, type: 'solid' },
      // Final Pearly Staircase to the Celestial Gates
      { x: 2510, y: 110, w: 620, h: 460, type: 'solid' },
    ],
    hazards: [
      { x: 480, y: 540, w: 930, h: 80, kind: 'river_current' },
    ],
    npcs: [
      {
        id: 'hopeful-10',
        name: 'Hopeful',
        role: 'Brother in the River',
        x: 260,
        y: 470,
        cloakColor: '#0284C7',
        accentColor: '#FEF08A',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'Christian',
            text: 'I sink in deep waters; the billows go over my head!',
          },
          {
            speaker: 'Hopeful',
            text: 'Be of good cheer, my brother: I feel the bottom, and it is good! Press [E] to hold fast the Promise and cross the River to Mount Zion!',
          },
        ],
      },
      {
        id: 'king-heralds-10',
        name: 'The King’s Trumpeters',
        role: 'At the Gates of Pearl',
        x: 2680,
        y: 110,
        cloakColor: '#FDE047',
        accentColor: '#FFFFFF',
        autoTrigger: true,
        dialogue: [
          {
            speaker: 'The Shining Heralds',
            text: 'Blessed are they that do His commandments, that they may have right to the tree of life, and may enter in through the gates into the city!',
          },
          {
            speaker: 'Voice of the King',
            text: 'Well done, thou good and faithful servant... enter thou into the joy of thy Lord!',
          },
        ],
      },
    ],
  },
};
