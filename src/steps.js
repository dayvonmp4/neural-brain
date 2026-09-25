// The talk, one step per drug. Order matches the deck (cases 01-05).
// Each step sets: which pathways run, how regions glow, where the camera
// looks, and what changes between Natural and Enhanced.

export const CHEM = {
  dopamine: { label: 'Dopamine', hex: '#ffb23d' },
  acetylcholine: { label: 'Acetylcholine', hex: '#3ee08f' },
  glutamate: { label: 'Glutamate', hex: '#ff4fb0' },
  calm: { label: 'Anxiety circuit', hex: '#a98bff' },
  alarm: { hex: '#ff4a3d' },
  signal: { label: 'All signals', hex: '#4fd4e4' },
};

// pathway state helpers: nat = before the drug, enh = with it
const run = (color, nat = { b: 0.3, flow: 0.3 }, enh = { b: 1, flow: 1 }) => ({
  nat: { color, ...nat }, enh: { color, ...enh },
});

export const STEPS = [
  {
    id: 'intro',
    chem: 'signal',
    title: 'Your brain, right now',
    body: '86 billion neurons, all signalling at once. Each drug in this talk turns up one of these signals. Drag the brain to spin it.',
    nat: 'Resting activity.',
    enh: 'Every signal turned up.',
    view: [0.18, -0.95],
    dim: 1,
    activity: { nat: 1, enh: 2.4 },
    pathways: {},
    glow: { enh: { frontal: ['#8fe9ff', 0.35], parietal: ['#8fe9ff', 0.35], temporal: ['#8fe9ff', 0.35], occipital: ['#8fe9ff', 0.35] } },
  },
  {
    id: 'bromantane',
    chem: 'dopamine',
    kicker: 'Case 01',
    title: 'Bromantane',
    body: 'Dopamine starts in the VTA, deep in the midbrain, and runs to the reward center and the front of the brain. It is the drive-and-reward signal.',
    nat: 'Normal dopamine flow.',
    enh: 'Bromantane makes neurons build more dopamine, so drive keeps building for days.',
    view: [0.12, -1.25],
    dim: 0.5,
    pathways: { dopamine: run(CHEM.dopamine.hex) },
    glow: {
      nat: { vta: ['#ffb23d', 0.4] },
      enh: { vta: ['#ffb23d', 1], accumbens: ['#ffb23d', 1], frontal: ['#ffb23d', 0.35] },
    },
  },
  {
    id: 'nefiracetam',
    chem: 'acetylcholine',
    kicker: 'Case 02',
    title: 'Nefiracetam',
    body: 'Acetylcholine fans out from the basal forebrain across the whole cortex and into the hippocampus, where new memories form.',
    nat: 'Normal acetylcholine signal.',
    enh: 'Nefiracetam holds its receptors open longer, so the same signal does more.',
    view: [0.42, -0.7],
    dim: 0.5,
    pathways: { acetylcholine: run(CHEM.acetylcholine.hex) },
    glow: {
      nat: { basalForebrain: ['#3ee08f', 0.4] },
      enh: { basalForebrain: ['#3ee08f', 1], hippocampus: ['#3ee08f', 1], parietal: ['#3ee08f', 0.25], frontal: ['#3ee08f', 0.25], temporal: ['#3ee08f', 0.25], occipital: ['#3ee08f', 0.25] },
    },
  },
  {
    id: 'tak653',
    chem: 'glutamate',
    kicker: 'Case 03',
    title: 'TAK-653',
    body: 'Glutamate is the brain’s main “go” signal, and the AMPA receptor is what hears it. It carries learning from the hippocampus to the front of the brain.',
    nat: 'Normal glutamate traffic.',
    enh: 'TAK-653 turns up the AMPA receptor. Connections strengthen and new synapses form.',
    view: [0.1, -1.4],
    dim: 0.5,
    pathways: { glutamate: run(CHEM.glutamate.hex) },
    glow: {
      nat: { hippocampus: ['#ff4fb0', 0.4] },
      enh: { hippocampus: ['#ff4fb0', 1], frontal: ['#ff4fb0', 0.4], temporal: ['#ff4fb0', 0.3] },
    },
    wave: { from: 'hip', color: '#ff4fb0', period: 4.2, amp: 0.6 },
  },
  {
    id: 'gb115',
    chem: 'calm',
    kicker: 'Case 04',
    title: 'GB-115',
    body: 'Under stress the amygdala fires, sending alarm signals to the front of the brain and the brainstem. CCK is one of the molecules that sets off panic.',
    nat: 'Alarm signal running.',
    enh: 'GB-115 blocks the CCK panic signal. The alarm goes quiet and thinking stays sharp.',
    view: [-0.05, -1.15],
    dim: 0.5,
    pathways: {
      alarm: {
        nat: { color: CHEM.alarm.hex, b: 0.95, flow: 1.5 },
        enh: { color: CHEM.calm.hex, b: 0.32, flow: 0.22 },
      },
    },
    glow: {
      nat: { amygdala: ['#ff4a3d', 1] },
      enh: { amygdala: ['#a98bff', 0.35], frontal: ['#a98bff', 0.2] },
    },
    flicker: { nat: 'amygdala' },
  },
  {
    id: 'ketamine',
    chem: 'glutamate',
    kicker: 'Case 05',
    title: 'Ketamine',
    body: 'Ketamine takes the brakes off neurons in the front of the brain, releasing a surge of glutamate.',
    nat: 'Normal activity.',
    enh: 'A glutamate surge, then new synapses grow within 24 hours.',
    view: [0.15, -0.5],
    dim: 0.5,
    pathways: { burst: run(CHEM.glutamate.hex, { b: 0.25, flow: 0.3 }, { b: 1, flow: 1.6 }) },
    glow: {
      nat: { frontal: ['#ff4fb0', 0.12] },
      enh: { frontal: ['#ff4fb0', 0.75], thalamus: ['#ff4fb0', 0.6] },
    },
    wave: { from: 'pfc', color: '#ff8fcf', period: 2.6, amp: 0.6 },
  },
  {
    id: 'all',
    chem: 'signal',
    title: 'Five drugs, five pathways',
    body: 'Three of these five would pass every drug panel that exists.',
    nat: 'A natural brain.',
    enh: 'An enhanced brain.',
    view: [0.25, -0.9],
    dim: 0.62,
    activity: { nat: 1, enh: 1.8 },
    pathways: {
      dopamine: run(CHEM.dopamine.hex, { b: 0.18, flow: 0.25 }, { b: 0.75, flow: 1 }),
      acetylcholine: run(CHEM.acetylcholine.hex, { b: 0.18, flow: 0.25 }, { b: 0.7, flow: 1 }),
      glutamate: run(CHEM.glutamate.hex, { b: 0.18, flow: 0.25 }, { b: 0.7, flow: 1 }),
      alarm: run(CHEM.calm.hex, { b: 0.15, flow: 0.25 }, { b: 0.6, flow: 0.5 }),
      burst: run(CHEM.glutamate.hex, { b: 0.12, flow: 0.25 }, { b: 0.55, flow: 1.3 }),
    },
    glow: {
      enh: { vta: ['#ffb23d', 0.35], accumbens: ['#ffb23d', 0.35], basalForebrain: ['#3ee08f', 0.35], hippocampus: ['#ff4fb0', 0.35], amygdala: ['#a98bff', 0.25] },
    },
  },
];
