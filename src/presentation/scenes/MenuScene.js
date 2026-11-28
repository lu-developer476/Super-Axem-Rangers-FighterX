import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/gameConfig.js';
import { STAGES } from '../../infrastructure/assets/stageAssetManifest.js';
import { RANGER_IDS } from '../../domain/rangers/rangerCatalog.js';
import { genderForRanger } from '../../domain/rangers/rangerVariants.js';
import { COMBAT_MODES, VERSUS_MODES, getCombatMode, getVersusMode } from '../../domain/match/matchModes.js';
import { menuSpriteKeyFor } from '../../infrastructure/assets/assetManifest.js';
import { playMenuMusic } from '../../infrastructure/audio/GameMusic.js';
import { contentWidth, getStackedButtonPositions, insetSize, mapPanelY, UI_SPACING } from '../views/uiLayout.js';

const RANGER_ORDER = [RANGER_IDS.WHITE, RANGER_IDS.RED];
const readableFontSize = (value = '10px') => {
  const size = Number.parseFloat(value);
  return Number.isFinite(size) ? Math.max(8, Math.round(size * 1.25)) + 'px' : value;
};
const TRAINING_COLORS = Object.freeze([
  { label: 'GRIS', color: '#555555' },
  { label: 'TURQUESA', color: '#238b8b' },
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const hexToHsv = (hex) => {
  const normalized = /^#[\da-f]{6}$/i.test(hex) ? hex.slice(1) : '555555';
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  return {
    h: (hue + 360) % 360,
    s: maximum === 0 ? 0 : delta / maximum,
    v: maximum,
  };
};

const hsvToHex = ({ h, s, v }) => {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = v - chroma;
  let rgb;

  if (segment < 1) rgb = [chroma, secondary, 0];
  else if (segment < 2) rgb = [secondary, chroma, 0];
  else if (segment < 3) rgb = [0, chroma, secondary];
  else if (segment < 4) rgb = [0, secondary, chroma];
  else if (segment < 5) rgb = [secondary, 0, chroma];
  else rgb = [chroma, 0, secondary];

  return '#' + rgb.map((channel) => Math.round((channel + match) * 255)
    .toString(16).padStart(2, '0')).join('');
};

const hexToColorNumber = (hex) => Number.parseInt(hex.slice(1), 16);

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
    this.page = 'home';
    this.buttons = [];
    this.selectedIndex = 0;
    this.matchSetup = {};
    this.characterSlot = 0;
    this.panelWidth = 282;
    this.stagePage = 0;
  }

  create() {
    playMenuMusic(this);
    this.#createBackdrop();
    this.ui = this.add.container(0, 0);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.#centerViewport, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.#centerViewport, this);
    });
    this.#centerViewport();
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      escape: Phaser.Input.Keyboard.KeyCodes.ESC,
    });
    this.#showHome();
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  #centerViewport() {
    const centerX = this.cameras.main.centerX;
    this.ui?.setX(centerX - GAME_WIDTH / 2);
    this.titleArt?.setX(centerX);
  }

  update() {
    if (this.page === 'training-color-picker') return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.up)) this.#moveSelection(-1);
    if (Phaser.Input.Keyboard.JustDown(this.keys.down)) this.#moveSelection(1);
    if (Phaser.Input.Keyboard.JustDown(this.keys.enter)) this.#activateSelection();

    if (Phaser.Input.Keyboard.JustDown(this.keys.escape) && this.page !== 'home') {
      this.#goBack();
    }
  }

  #createBackdrop() {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1)
      .setOrigin(0, 0)
      .setDepth(-100);

    const titleTexture = this.textures.get('title-art').getSourceImage();
    const titleScale = Math.min(1, 436 / titleTexture.width, 78 / titleTexture.height);
    this.titleArt = this.add.image(GAME_WIDTH / 2, 42, 'title-art')
      .setScale(titleScale)
      .setAlpha(1)
      .setDepth(2);
  }


  /** Retratos Super Axem reducidos, con un aura ambiental distinta por transformación. */
  #addHomeRangerArt() {
    const addAura = (x, baseline, color) => {
      const centerY = baseline - 43;
      const glow = this.add.ellipse(x, centerY, 66, 82, color, 0.10);
      const outerRing = this.add.ellipse(x, centerY, 76, 88, 0x000000, 0)
        .setStrokeStyle(2, color, 0.48);
      const innerRing = this.add.ellipse(x, centerY, 53, 72, 0x000000, 0)
        .setStrokeStyle(1, color, 0.34);
      const groundGlow = this.add.ellipse(x, baseline - 2, 64, 8, color, 0.18);
      const motes = [
        [-29, -47], [27, -58], [-22, -12], [31, -25],
      ].map(([dx, dy], index) => {
        const mote = this.add.circle(x + dx, centerY + dy, index % 2 === 0 ? 2 : 1, color, 0.76);
        this.tweens.add({
          targets: mote,
          x: x - dx * 0.55,
          y: centerY + dy + (index % 2 === 0 ? -12 : 10),
          alpha: { from: 0.18, to: 0.82 },
          duration: 1250 + index * 170,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          delay: index * 120,
        });
        return mote;
      });

      this.ui.add([glow, outerRing, innerRing, groundGlow, ...motes]);
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.06, to: 0.17 },
        scaleX: { from: 0.92, to: 1.12 },
        scaleY: { from: 0.95, to: 1.08 },
        duration: 1650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: [outerRing, innerRing],
        alpha: { from: 0.22, to: 0.56 },
        scaleX: { from: 0.94, to: 1.07 },
        scaleY: { from: 1.02, to: 0.94 },
        duration: 1900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: groundGlow,
        alpha: { from: 0.10, to: 0.25 },
        scaleX: { from: 0.86, to: 1.12 },
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    };

    const orangeX = GAME_WIDTH / 2;
    const baseline = 154;
    addAura(orangeX, baseline, 0xff8b3d);
    const orangeKey = menuSpriteKeyFor(RANGER_IDS.ORANGE, 'male');
    const artwork = this.textures.get(orangeKey).getSourceImage();
    const orange = this.add.image(orangeX, baseline, orangeKey)
      .setOrigin(0.5, 1).setScale(150 / artwork.height).setDepth(1);
    this.ui.add(orange);
  }
  #beginPage(title, width = 282, height = 120) {
    this.#clearTrainingPickerKeyboard();
    this.trainingColorPicker = null;
    this.ui.removeAll(true);
    this.buttons = [];
    this.selectedIndex = 0;
    this.panelWidth = width;

    // Todos los paneles reservan una franja inferior libre y se ajustan al alto real.
    const safeBottom = GAME_HEIGHT - UI_SPACING.modalFooterReserve;
    const panelY = Math.min(171, safeBottom - height / 2);
    const panelTop = panelY - height / 2;
    const panelBottom = panelY + height / 2;
    this.panelLayout = {
      sourceTop: 122,
      sourceBottom: 239,
      targetTop: panelTop + UI_SPACING.modalTopInset,
      targetBottom: panelBottom - UI_SPACING.modalBottomInset - 9,
      headerRuleY: panelTop + UI_SPACING.modalHeaderRuleInset,
    };
    const isHome = this.page === 'home';
    this.titleArt?.setVisible(isHome);
    const shadow = this.add.rectangle(
      GAME_WIDTH / 2 + 3, panelY + 3, width, height, 0x06040b, isHome ? 0.16 : 0.92,
    );
    const panel = this.add.rectangle(
      GAME_WIDTH / 2, panelY, width, height, isHome ? 0x000000 : 0x100d1e, isHome ? 1 : 0.98,
    ).setStrokeStyle(isHome ? 0 : 1, 0x9277a8, isHome ? 0 : 0.95);
    const inset = this.add.rectangle(
      GAME_WIDTH / 2, panelY, insetSize(width), insetSize(height), 0x000000, 0,
    ).setStrokeStyle(isHome ? 0 : 1, 0x3a2c50, isHome ? 0 : 0.9);
    const accent = this.add.rectangle(
      GAME_WIDTH / 2,
      panelTop + UI_SPACING.modalHeaderRuleInset,
      width - 24,
      1,
      0xd3a66d,
      isHome ? 0 : 0.72,
    );
    this.ui.add([shadow, panel, inset, accent]);

    if (title) {
      this.#addText(title, GAME_WIDTH / 2, 122, {
        fontSize: this.page === 'credits' ? '8px' : '12px',
        color: '#f7cf83',
        letterSpacing: 1,
      });
    }
  }

  #beginCharacterModal(title = 'SELECCIONAR PERSONAJE') {
    this.#clearTrainingPickerKeyboard();
    this.trainingColorPicker = null;
    this.ui.removeAll(true);
    this.buttons = [];
    this.selectedIndex = 0;
    this.panelWidth = 380;

    const veil = this.add.rectangle(GAME_WIDTH / 2, 135, GAME_WIDTH, 270, 0x000000, 0.84)
      .setInteractive();
    const panelY = 160;
    const panelHeight = 146;
    const panelTop = panelY - panelHeight / 2;
    const panelBottom = panelY + panelHeight / 2;
    this.panelLayout = {
      sourceTop: 130,
      sourceBottom: 220,
      targetTop: panelTop + UI_SPACING.modalTopInset,
      targetBottom: panelBottom - UI_SPACING.modalBottomInset - 9,
    };
    const shadow = this.add.rectangle(GAME_WIDTH / 2 + 3, panelY + 3, this.panelWidth, panelHeight, 0x06040b, 0.95);
    const panel = this.add.rectangle(GAME_WIDTH / 2, panelY, this.panelWidth, panelHeight, 0x100d1e, 0.99)
      .setStrokeStyle(1, 0xd3a66d, 0.96);
    const inset = this.add.rectangle(
      GAME_WIDTH / 2,
      panelY,
      insetSize(this.panelWidth),
      insetSize(panelHeight),
      0x000000,
      0,
    ).setStrokeStyle(1, 0x4b385c, 0.92);
    const accent = this.add.rectangle(
      GAME_WIDTH / 2,
      panelTop + UI_SPACING.modalHeaderRuleInset,
      this.panelWidth - 24,
      1,
      0xd3a66d,
      0.82,
    );
    this.ui.add([veil, shadow, panel, inset, accent]);

    this.#addText(title, GAME_WIDTH / 2, 130, {
      fontSize: '12px',
      color: '#f7cf83',
      letterSpacing: 1,
    });
    const mode = getVersusMode(this.matchSetup.versusMode);
    this.#addText(mode.slotLabels[this.characterSlot] ?? 'PERSONAJE', GAME_WIDTH / 2, 149, {
      fontSize: '7px',
      color: '#b7a9cb',
    });
  }

  #addText(value, x, y, style = {}) {
    const text = this.add.text(x, this.#mapPanelY(y), value, {
      fontFamily: 'monospace',
      fontSize: readableFontSize(style.fontSize ?? '10px'),
      color: '#e7def5',
      align: 'center',
      wordWrap: {
        width: Math.max(100, contentWidth(this.panelWidth)),
        useAdvancedWrap: true,
      },
      ...style,
    });
    text.setFontSize(readableFontSize(style.fontSize ?? '10px')).setOrigin(0.5);
    this.ui.add(text);
    return text;
  }

  #addButton(title, y, action, {
    width = 210,
    fontSize = '8px',
    x = GAME_WIDTH / 2,
    height = 16,
    shadowOffset = 2,
  } = {}) {
    // El fondo, la etiqueta y el área interactiva comparten exactamente el mismo ancho y centro.
    y = this.#mapPanelY(y);
    const buttonWidth = Math.floor(Math.min(width, Math.max(112, contentWidth(this.panelWidth))));
    const buttonHeight = height;
    const labelFontSize = readableFontSize(fontSize);
    const shadow = this.add.rectangle(x, y + shadowOffset, buttonWidth, buttonHeight, 0x090612, 0.98);
    const box = this.add.rectangle(x, y, buttonWidth, buttonHeight, 0x211a32, 0.98)
      .setStrokeStyle(1, 0x76618f, 1);
    const highlight = this.add.rectangle(x, y - 8, buttonWidth - 6, 1, 0xb69acb, 0.3);
    const label = this.add.text(x, y, title, {
      fontFamily: 'monospace',
      fontSize: labelFontSize,
      color: '#d9cde9',
      align: 'center',
      wordWrap: { width: contentWidth(buttonWidth, UI_SPACING.buttonTextGutter), useAdvancedWrap: true },
    }).setOrigin(0.5);
    const hitArea = this.add.rectangle(x, y, buttonWidth, buttonHeight, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    const index = this.buttons.length;
    this.buttons.push({ title, box, label, action });
    hitArea.on('pointerover', () => {
      this.selectedIndex = index;
      this.#refreshButtons();
    });
    hitArea.on('pointerdown', () => {
      this.selectedIndex = index;
      this.#refreshButtons();
      this.#activateSelection();
    });

    this.ui.add([shadow, box, highlight, label, hitArea]);
    this.#refreshButtons();
  }

  #addColorOption(title, color, x, y) {
    y = this.#mapPanelY(y);
    const width = 62;
    const height = 28;
    const box = this.add.rectangle(x, y, width, height, 0x241b3c, 0.98)
      .setStrokeStyle(1, 0x62527e, 1);
    const swatch = this.add.rectangle(x, y - 5, width - 10, 8, 0x111111, 1)
      .setStrokeStyle(1, 0x80758f, 0.8);
    const label = this.add.text(x, y + 8, title, {
      fontFamily: 'monospace',
      fontSize: readableFontSize('6px'),
      color: '#d9cde9',
      align: 'center',
    }).setOrigin(0.5);
    const hitArea = this.add.rectangle(x, y, width, height, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    const action = () => {
      this.matchSetup.trainingBackgroundColor = color;
      this.#showTrainingColors();
    };
    const index = this.buttons.length;
    this.buttons.push({ title, box, label, action, color, swatch });
    hitArea.on('pointerover', () => {
      this.selectedIndex = index;
      this.#refreshButtons();
    });
    hitArea.on('pointerdown', () => {
      this.selectedIndex = index;
      this.#refreshButtons();
      this.#activateSelection();
    });
    this.ui.add([box, swatch, label, hitArea]);
    this.#refreshButtons();
  }

  #mapPanelY(y) {
    const layout = this.panelLayout;
    return layout
      ? mapPanelY(y, layout.sourceTop, layout.sourceBottom, layout.targetTop, layout.targetBottom)
      : y;
  }

  #unmapPanelY(y) {
    const layout = this.panelLayout;
    if (!layout || layout.targetBottom <= layout.targetTop) return y;
    const progress = (y - layout.targetTop) / (layout.targetBottom - layout.targetTop);
    return layout.sourceTop + progress * (layout.sourceBottom - layout.sourceTop);
  }

  #addStackedButtons(items, { buttonStyle = {} } = {}) {
    const buttonHeight = buttonStyle.height ?? 16;
    const positions = getStackedButtonPositions(
      items.length,
      this.panelLayout?.headerRuleY,
      { buttonHeight },
    );

    items.forEach((item, index) => {
      this.#addButton(
        item.label,
        this.#unmapPanelY(positions[index]),
        item.action,
        { ...buttonStyle, height: buttonHeight },
      );
    });
  }

  #refreshButtons() {
    this.buttons.forEach((button, index) => {
      const selected = index === this.selectedIndex;
      button.box.setStrokeStyle(selected ? 1 : 0.75, selected ? 0xf0bd72 : 0x62527e, 0.9);

      if (button.color) {
        button.box.setFillStyle(0x241b3c, 0.98);
        button.swatch.setFillStyle(Phaser.Display.Color.HexStringToColor(button.color).color, 1);
        button.label.setColor(selected ? '#fff0c9' : '#d9cde9');
        button.label.setText((selected ? '✓ ' : '') + button.title);
        return;
      }

      button.box.setFillStyle(selected ? 0x60405a : 0x241b3c, 0.98);
      button.label.setColor(selected ? '#fff0c9' : '#d9cde9');
      button.label.setText(button.title);
    });
  }

  #moveSelection(direction) {
    if (!this.buttons.length) return;
    this.selectedIndex = (this.selectedIndex + direction + this.buttons.length) % this.buttons.length;
    this.#refreshButtons();
  }

  #activateSelection() {
    const selected = this.buttons[this.selectedIndex];
    if (selected) selected.action();
  }

  #getMatchSetup() { return { ...this.matchSetup, characters: [...(this.matchSetup.characters ?? [])] }; }

  #startSelectedFight(stageId, cinematic = true) {
    this.scene.start(cinematic ? 'CinematicScene' : 'FightScene', {
      stageId,
      matchSetup: this.#getMatchSetup(),
    });
  }

  #moveSelectionBackToCharacters() {
    this.characterSlot = 0;
    this.#showCharacterModal();
  }

  #showPreviousConfiguration() {
    if (this.matchSetup.versusMode === 'player-vs-ai') {
      this.#moveSelectionBackToCharacters();
      return;
    }
    this.characterSlot = Math.max(0, getVersusMode(this.matchSetup.versusMode).characterSlots - 1);
    this.#showCharacterModal();
  }

  #goBack() {
    if (this.page === 'play') {
      this.#showHome();
      return;
    }
    if (this.page === 'versus' || this.page === 'race') {
      this.#showPlayModes();
      return;
    }
    if (this.page === 'combat') {
      this.#showVersusModes();
      return;
    }
    if (this.page === 'combat-rounds') {
      this.#showCombatModes();
      return;
    }
    if (this.page === 'characters') {
      if (this.characterSlot > 0) {
        this.characterSlot -= 1;
        this.#showCharacterModal();
      } else {
        this.#showCombatModes();
      }
      return;
    }
    if (this.page === 'training-color-picker') {
      this.#cancelTrainingColorPicker();
      return;
    }
    if (this.page === 'training-colors') {
      this.#showPreviousConfiguration();
      return;
    }
    if (this.page === 'stage-variants') {
      this.#showStages();
      return;
    }
    if (this.page === 'stages') {
      this.#showPreviousConfiguration();
      return;
    }
    this.#showHome();
  }

  #showHome() {
    this.page = 'home';
    this.matchSetup = {};
    this.characterSlot = 0;
    this.#beginPage('', 282, 146);
    this.#addButton('JUGAR', 190, () => this.#showPlayModes(), { width: 194, height: 17 });
    this.#addButton('TUTORIAL', 211, () => this.#showControls(), { width: 194, height: 17 });
    this.#addButton('CRÉDITOS', 232, () => this.#showCredits(), { width: 194, height: 17 });
    
  }

  #showPlayModes() {
    this.page = 'play';
    this.#beginPage('JUGAR', 330, 168);

    const buttonStyle = { width: 230, fontSize: '8px', height: 16, shadowOffset: 0 };
    this.#addButton('COMBATE', 156, () => this.#showVersusModes(), buttonStyle);
    this.#addButton('CARRERA', 182, () => this.#showRaceModes(), buttonStyle);
    this.#addButton('VOLVER', 239, () => this.#showHome(), {
      width: 150, fontSize: '7px', shadowOffset: 0,
    });
  }

  #showRaceModes() {
    this.page = 'race';
    this.#beginPage('CARRERA', 330, 168);

    const buttonStyle = { width: 230, fontSize: '8px', height: 16, shadowOffset: 0 };
    this.#addButton('CARRERA AXEM', 156, () => this.scene.start('HaxeMinigameScene', { mode: 'axem' }), buttonStyle);
    this.#addButton('CARRERA TERRESTRE', 182, () => this.scene.start('HaxeMinigameScene', { mode: 'land' }), buttonStyle);
    this.#addButton('VOLVER', 239, () => this.#showPlayModes(), {
      width: 150, fontSize: '7px', shadowOffset: 0,
    });
  }

  #showVersusModes() {
    this.page = 'versus';
    this.matchSetup = {
      characters: [],
      playerSide: 'left',
    };
    this.#beginPage('COMBATE', 330, 168);

    const buttonStyle = { width: 230, fontSize: '8px', height: 16, shadowOffset: 0 };
    this.#addStackedButtons(
      VERSUS_MODES.map((mode) => ({
        label: mode.label,
        action: () => {
          this.matchSetup.versusMode = mode.id;
          this.#showCombatModes();
        },
      })),
      { buttonStyle },
    );

    this.#addButton('VOLVER', 239, () => this.#showPlayModes(), {
      width: 150, fontSize: '7px', shadowOffset: 0,
    });
    
  }

  #showCombatModes() {
    this.page = 'combat';
    this.#beginPage('MODO', 330, 168);
    const chooseMode = (modeId) => {
      this.matchSetup.combatMode = modeId;
      this.matchSetup.characters = [];
      this.characterSlot = 0;
      this.#showCharacterModal();
    };

    // Los tres modos ocupan una columna uniforme dentro del panel MODO.
    // RONDAS conserva el mismo botón y selección que los demás; abre su submodal.
    const buttonStyle = {
      width: 230,
      fontSize: '8px',
      height: 16,
      shadowOffset: 0,
    };
    this.#addStackedButtons([
      { label: 'DEFINITIVO', action: () => chooseMode('definitive') },
      { label: 'RONDAS', action: () => this.#showRoundOptions() },
      { label: 'ENTRENAMIENTO', action: () => chooseMode('training') },
    ], { buttonStyle });
    this.#addButton('VOLVER', 239, () => this.#showVersusModes(), {
      width: 150,
      fontSize: '7px',
      shadowOffset: 0,
    });
  }

  #showRoundOptions() {
    this.page = 'combat-rounds';
    this.#beginPage('RONDAS', 330, 168);
    const chooseRounds = (modeId) => {
      this.matchSetup.combatMode = modeId;
      this.matchSetup.characters = [];
      this.characterSlot = 0;
      this.#showCharacterModal();
    };

    const buttonStyle = { width: 230, fontSize: '8px', height: 16, shadowOffset: 0 };
    this.#addButton('2 RONDAS', 156, () => chooseRounds('two-rounds'), buttonStyle);
    this.#addButton('5 RONDAS', 182, () => chooseRounds('five-rounds'), buttonStyle);
    this.#addButton('VOLVER', 239, () => this.#showCombatModes(), {
      width: 150, fontSize: '7px', shadowOffset: 0,
    });
  }

  #showCharacterModal() {
    this.page = 'characters';
    this.#beginCharacterModal();

    RANGER_ORDER.forEach((rangerId, index) => {
      const rangerLabel = ({ orange: 'NARANJA', white: 'BLANCO', red: 'ROJO' })[rangerId];
      this.#addButton('AXEM ' + rangerLabel, 173 + index * 18, () => {
        this.#selectCharacter(rangerId);
      }, {
        width: 154,
        x: GAME_WIDTH / 2,
        fontSize: '7px',
      });
    });
  }

  #selectCharacter(rangerId) {
    const mode = getVersusMode(this.matchSetup.versusMode);
    this.matchSetup.characters[this.characterSlot] = { id: rangerId, gender: genderForRanger(rangerId) };
    if (this.characterSlot + 1 < mode.characterSlots) {
      this.characterSlot += 1;
      this.#showCharacterModal();
      return;
    }
    if (mode.characterSlots === 1) this.matchSetup.characters[1] = { id: rangerId, gender: genderForRanger(rangerId) };
    this.#showNextConfiguration();
  }

  #showNextConfiguration() {
    if (getCombatMode(this.matchSetup.combatMode).id === 'training') {
      this.#showTrainingColors();
      return;
    }
    this.#showStages();
  }

  #showTrainingColors() {
    this.page = 'training-colors';
    this.matchSetup.trainingBackgroundColor ??= '#555555';
    this.#beginPage('FONDO DE ENTRENAMIENTO', 430, 188);
    const selectedColorIndex = TRAINING_COLORS.findIndex(
      (item) => item.color === this.matchSetup.trainingBackgroundColor,
    );
    this.selectedIndex = selectedColorIndex;
    const centers = [180, 300];
    TRAINING_COLORS.forEach(({ label, color }, index) => {
      this.#addColorOption(label, color, centers[index], 169);
    });

    this.#addButton('MÁS COLORES', 205, () => this.#showTrainingColorPicker(), {
      width: 170,
      fontSize: '7px',
    });
    this.#addButton('VOLVER', 228, () => this.#showPreviousConfiguration(), {
      width: 112, x: 150, fontSize: '7px',
    });
    this.#addButton('COMENZAR', 228, () => this.#startSelectedFight('practice-zone', false), {
      width: 150,
      x: 320,
      fontSize: '7px',
    });
  }


  #showTrainingColorPicker() {
    this.page = 'training-color-picker';
    const initialColor = this.matchSetup.trainingBackgroundColor ?? '#555555';
    this.#beginPage('PERSONALIZAR COLOR', 430, 214);
    this.trainingColorPicker = {
      color: initialColor.toLowerCase(),
      hex: initialColor.slice(1).toUpperCase(),
      hsv: hexToHsv(initialColor),
      hexEditing: false,
      replaceHexOnType: false,
      palette: {
        x: 155,
        y: this.#mapPanelY(176),
        width: 238,
        height: 78,
      },
      hueBar: {
        x: 155,
        y: this.#mapPanelY(219),
        width: 238,
        height: 10,
      },
    };

    this.#addText('SATURACIÓN / BRILLO', 155, 145, {
      fontSize: '6px',
      color: '#c9b7dc',
    });
    this.#addText('VISTA PREVIA', 366, 145, {
      fontSize: '6px',
      color: '#c9b7dc',
    });
    this.#addText('TONO', 155, 207, {
      fontSize: '6px',
      color: '#c9b7dc',
    });
    this.#addText('CÓDIGO HEX', 366, 188, {
      fontSize: '6px',
      color: '#c9b7dc',
    });

    const { palette, hueBar } = this.trainingColorPicker;
    this.trainingPickerPaletteGraphics = this.add.graphics();
    this.trainingPickerHueGraphics = this.add.graphics();
    this.ui.add([this.trainingPickerPaletteGraphics, this.trainingPickerHueGraphics]);

    const paletteHit = this.add.rectangle(
      palette.x, palette.y, palette.width, palette.height, 0xffffff, 0,
    ).setInteractive({ useHandCursor: true });
    const updatePalette = (pointer) => this.#updateTrainingPickerFromPalette(pointer);
    paletteHit.on('pointerdown', updatePalette);
    paletteHit.on('pointermove', (pointer) => {
      if (pointer.isDown) updatePalette(pointer);
    });
    this.ui.add(paletteHit);

    const hueHit = this.add.rectangle(
      hueBar.x, hueBar.y, hueBar.width, hueBar.height + 8, 0xffffff, 0,
    ).setInteractive({ useHandCursor: true });
    const updateHue = (pointer) => this.#updateTrainingPickerHue(pointer);
    hueHit.on('pointerdown', updateHue);
    hueHit.on('pointermove', (pointer) => {
      if (pointer.isDown) updateHue(pointer);
    });
    this.ui.add(hueHit);

    const previewY = this.#mapPanelY(168);
    this.trainingPickerPreviewFrame = this.add.rectangle(366, previewY, 116, 56, 0x0d0a17, 1)
      .setStrokeStyle(1, 0xd3a66d, 1);
    this.trainingPickerPreview = this.add.rectangle(366, previewY, 108, 48, hexToColorNumber(initialColor), 1)
      .setStrokeStyle(1, 0xf0dfbd, 0.75);
    this.ui.add([this.trainingPickerPreviewFrame, this.trainingPickerPreview]);

    const hexFieldY = this.#mapPanelY(207);
    this.trainingPickerHexFrame = this.add.rectangle(366, hexFieldY, 116, 25, 0x171222, 1)
      .setStrokeStyle(1, 0x76618f, 1);
    this.trainingPickerHexText = this.add.text(366, hexFieldY, '#' + this.trainingColorPicker.hex, {
      fontFamily: 'monospace',
      fontSize: readableFontSize('8px'),
      color: '#fff0c9',
      align: 'center',
    }).setOrigin(0.5);
    const hexHit = this.add.rectangle(366, hexFieldY, 116, 25, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    hexHit.on('pointerdown', () => {
      const picker = this.trainingColorPicker;
      picker.hexEditing = true;
      picker.replaceHexOnType = true;
      this.#refreshTrainingColorPicker();
    });
    this.ui.add([this.trainingPickerHexFrame, this.trainingPickerHexText, hexHit]);

    this.trainingPickerHint = this.#addText('CLIC EN HEX PARA ESCRIBIR', 366, 226, {
      fontSize: '5px',
      color: '#8f86ae',
    });

    this.#addButton('CANCELAR', 237, () => this.#cancelTrainingColorPicker(), {
      width: 132,
      x: 165,
      fontSize: '7px',
    });
    this.#addButton('CONFIRMAR', 237, () => this.#confirmTrainingColorPicker(), {
      width: 142,
      x: 315,
      fontSize: '7px',
    });

    this.trainingPickerKeyHandler = (event) => this.#handleTrainingPickerKeyboard(event);
    this.input.keyboard.on('keydown', this.trainingPickerKeyHandler);
    this.trainingPickerShutdownHandler = () => this.#clearTrainingPickerKeyboard();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.trainingPickerShutdownHandler);
    this.#refreshTrainingColorPicker();
  }

  #drawTrainingPickerPalette() {
    const picker = this.trainingColorPicker;
    if (!picker || !this.trainingPickerPaletteGraphics) return;
    const { x, y, width, height } = picker.palette;
    const columns = 24;
    const rows = 12;
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const graphics = this.trainingPickerPaletteGraphics;
    graphics.clear();

    for (let row = 0; row < rows; row += 1) {
      const value = 1 - row / (rows - 1);
      for (let column = 0; column < columns; column += 1) {
        const saturation = column / (columns - 1);
        graphics.fillStyle(hexToColorNumber(hsvToHex({
          h: picker.hsv.h,
          s: saturation,
          v: value,
        })), 1);
        graphics.fillRect(
          x - width / 2 + column * cellWidth,
          y - height / 2 + row * cellHeight,
          cellWidth + 0.6,
          cellHeight + 0.6,
        );
      }
    }

    const markerX = x - width / 2 + picker.hsv.s * width;
    const markerY = y - height / 2 + (1 - picker.hsv.v) * height;
    graphics.lineStyle(3, 0x110d1b, 1);
    graphics.strokeRect(markerX - 5, markerY - 5, 10, 10);
    graphics.lineStyle(1, 0xffffff, 1);
    graphics.strokeRect(markerX - 4, markerY - 4, 8, 8);
    graphics.lineStyle(1, 0xe2c58f, 1);
    graphics.strokeRect(x - width / 2, y - height / 2, width, height);
  }

  #drawTrainingPickerHue() {
    const picker = this.trainingColorPicker;
    if (!picker || !this.trainingPickerHueGraphics) return;
    const { x, y, width, height } = picker.hueBar;
    const graphics = this.trainingPickerHueGraphics;
    const segments = 48;
    const segmentWidth = width / segments;
    graphics.clear();

    for (let index = 0; index < segments; index += 1) {
      graphics.fillStyle(hexToColorNumber(hsvToHex({
        h: (index / segments) * 360,
        s: 1,
        v: 1,
      })), 1);
      graphics.fillRect(
        x - width / 2 + index * segmentWidth,
        y - height / 2,
        segmentWidth + 0.5,
        height,
      );
    }

    const markerX = x - width / 2 + (picker.hsv.h / 360) * width;
    graphics.lineStyle(3, 0x110d1b, 1);
    graphics.lineBetween(markerX, y - height / 2 - 3, markerX, y + height / 2 + 3);
    graphics.lineStyle(1, 0xffffff, 1);
    graphics.lineBetween(markerX, y - height / 2 - 2, markerX, y + height / 2 + 2);
    graphics.lineStyle(1, 0xe2c58f, 1);
    graphics.strokeRect(x - width / 2, y - height / 2, width, height);
  }

  #refreshTrainingColorPicker() {
    const picker = this.trainingColorPicker;
    if (!picker) return;
    this.#drawTrainingPickerPalette();
    this.#drawTrainingPickerHue();
    this.trainingPickerPreview?.setFillStyle(hexToColorNumber(picker.color), 1);
    this.trainingPickerHexText?.setText(
      (picker.hexEditing ? 'EDITAR ' : '') +
      '#' + picker.hex.padEnd(6, '_'),
    );
    this.trainingPickerHexFrame?.setStrokeStyle(
      1,
      picker.hexEditing ? 0xf0bd72 : 0x76618f,
      1,
    );
    this.trainingPickerHint?.setText(
      picker.hexEditing ? 'ESCRIBÍ 6 DÍGITOS · ENTER' : 'CLIC EN HEX PARA ESCRIBIR',
    );
    this.trainingPickerHint?.setColor(picker.hexEditing ? '#f0bd72' : '#8f86ae');
  }

  #applyTrainingPickerHsv(hsv) {
    const picker = this.trainingColorPicker;
    if (!picker) return;
    picker.hsv = {
      h: ((hsv.h % 360) + 360) % 360,
      s: clamp(hsv.s, 0, 1),
      v: clamp(hsv.v, 0, 1),
    };
    picker.color = hsvToHex(picker.hsv);
    picker.hex = picker.color.slice(1).toUpperCase();
    picker.hexEditing = false;
    picker.replaceHexOnType = false;
    this.#refreshTrainingColorPicker();
  }

  #applyTrainingPickerHex(hex) {
    const picker = this.trainingColorPicker;
    if (!picker || !/^#[\da-f]{6}$/i.test(hex)) return;
    picker.color = hex.toLowerCase();
    picker.hex = hex.slice(1).toUpperCase();
    picker.hsv = hexToHsv(picker.color);
    picker.replaceHexOnType = false;
    this.#refreshTrainingColorPicker();
  }

  #updateTrainingPickerFromPalette(pointer) {
    const picker = this.trainingColorPicker;
    if (!picker) return;
    const { x, y, width, height } = picker.palette;
    this.#applyTrainingPickerHsv({
      ...picker.hsv,
      s: (clamp(pointer.x, x - width / 2, x + width / 2) - (x - width / 2)) / width,
      v: 1 - (clamp(pointer.y, y - height / 2, y + height / 2) - (y - height / 2)) / height,
    });
  }

  #updateTrainingPickerHue(pointer) {
    const picker = this.trainingColorPicker;
    if (!picker) return;
    const { x, width } = picker.hueBar;
    const progress = (clamp(pointer.x, x - width / 2, x + width / 2) - (x - width / 2)) / width;
    this.#applyTrainingPickerHsv({ ...picker.hsv, h: progress * 360 });
  }

  #handleTrainingPickerKeyboard(event) {
    if (this.page !== 'training-color-picker') return;
    const picker = this.trainingColorPicker;
    if (!picker) return;

    if (event.key === 'Escape') {
      event.preventDefault?.();
      this.#cancelTrainingColorPicker();
      return;
    }

    if (picker.hexEditing) {
      if (event.key === 'Enter') {
        event.preventDefault?.();
        if (picker.hex.length === 6) {
          picker.hexEditing = false;
          picker.replaceHexOnType = false;
          this.#refreshTrainingColorPicker();
        } else {
          this.trainingPickerHint?.setText('COMPLETÁ LOS 6 DÍGITOS HEX');
          this.trainingPickerHint?.setColor('#ff9b9b');
        }
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault?.();
        if (picker.replaceHexOnType) {
          picker.hex = '';
          picker.replaceHexOnType = false;
        } else {
          picker.hex = picker.hex.slice(0, -1);
        }
        this.#refreshTrainingColorPicker();
        return;
      }
      if (/^[\da-f]$/i.test(event.key) && (picker.replaceHexOnType || picker.hex.length < 6)) {
        event.preventDefault?.();
        picker.hex = (picker.replaceHexOnType ? '' : picker.hex) + event.key.toUpperCase();
        picker.replaceHexOnType = false;
        if (picker.hex.length === 6) this.#applyTrainingPickerHex('#' + picker.hex);
        else this.#refreshTrainingColorPicker();
        return;
      }
      if (event.key.length === 1) event.preventDefault?.();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault?.();
      this.#moveSelection(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault?.();
      this.#moveSelection(1);
    } else if (event.key === 'Enter') {
      event.preventDefault?.();
      this.#activateSelection();
    }
  }

  #clearTrainingPickerKeyboard() {
    if (this.trainingPickerKeyHandler && this.input?.keyboard) {
      this.input.keyboard.off('keydown', this.trainingPickerKeyHandler);
    }
    this.trainingPickerKeyHandler = null;
    if (this.trainingPickerShutdownHandler) {
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.trainingPickerShutdownHandler);
    }
    this.trainingPickerShutdownHandler = null;
  }

  #confirmTrainingColorPicker() {
    if (!this.trainingColorPicker) return;
    this.matchSetup.trainingBackgroundColor = this.trainingColorPicker.color;
    this.#showTrainingColors();
  }

  #cancelTrainingColorPicker() {
    this.#showTrainingColors();
  }

  #showStages(page = 0) {
    this.page = 'stages';
    const versus = getVersusMode(this.matchSetup.versusMode);
    const combat = getCombatMode(this.matchSetup.combatMode);
    const pageSize = 4;
    const pageCount = Math.max(1, Math.ceil(STAGES.length / pageSize));
    this.stagePage = Math.max(0, Math.min(page, pageCount - 1));
    const pageStart = this.stagePage * pageSize;
    const visibleStages = STAGES.slice(pageStart, pageStart + pageSize);

    this.#beginPage('ESCENARIOS', 420, 178);
    this.#addText(versus.label + ' · ' + combat.label, GAME_WIDTH / 2, 137, {
      fontSize: '6px',
      color: '#b7a9cb',
    });
    this.#addText('PÁGINA ' + (this.stagePage + 1) + ' / ' + pageCount, GAME_WIDTH / 2, 147, {
      fontSize: '5px',
      color: '#9185aa',
    });

    if (visibleStages.length === 0) {
      this.#addText('NO HAY MAPAS O TILESETS DISPONIBLES', GAME_WIDTH / 2, 180, {
        fontSize: '7px',
        color: '#d0c4dc',
      });
    }

    visibleStages.forEach((stage, index) => {
      const cleanName = stage.name.replace(/\s*[·-]\s*Tileset$/i, '');
      this.#addButton(cleanName.toUpperCase(), 166 + index * 17, () => {
        this.#startSelectedFight(stage.id);
      }, {
        width: 300,
        fontSize: '6px',
        height: 14,
      });
    });

    if (this.stagePage > 0) {
      this.#addButton('ANTERIOR', 239, () => this.#showStages(this.stagePage - 1), {
        width: 92,
        x: 92,
        fontSize: '5px',
        height: 13,
      });
    }
    this.#addButton('VOLVER', 239, () => this.#showPreviousConfiguration(), {
      width: 92, x: 240, fontSize: '6px', height: 13,
    });
    if (this.stagePage < pageCount - 1) {
      this.#addButton('SIGUIENTE', 239, () => this.#showStages(this.stagePage + 1), {
        width: 92,
        x: 388,
        fontSize: '5px',
        height: 13,
      });
    }
    
  }

  #showControls() {
    this.page = 'controls';
    this.#beginPage('TUTORIAL', 430, 214);
    this.#addText('JUGADOR 1', GAME_WIDTH / 2, 140, {
      fontSize: '7px',
      color: '#d9a9ff',
    });
    this.#addText('TERRESTRE · IZQUIERDA A · DERECHA D · ARRIBA W · ABAJO S', GAME_WIDTH / 2, 153, {
      fontSize: '5px',
    });
    this.#addText('VUELO · SUBIR Q · BAJAR E · HACHAZO F · TELETRANSPORTE G', GAME_WIDTH / 2, 166, {
      fontSize: '5px',
    });
    this.#addText('DASH C · BLOQUEAR V · ESQUIVAR X · ATAQUE ESPECIAL Z', GAME_WIDTH / 2, 179, {
      fontSize: '5px',
    });
    this.#addText('JUGADOR 2', GAME_WIDTH / 2, 192, {
      fontSize: '7px',
      color: '#ffc17e',
    });
    this.#addText('TERRESTRE · IZQUIERDA ← · DERECHA → · ARRIBA ↑ · ABAJO ↓', GAME_WIDTH / 2, 205, {
      fontSize: '5px',
    });
    this.#addText('VUELO · SUBIR I · BAJAR O · HACHAZO L · TELETRANSPORTE K', GAME_WIDTH / 2, 218, {
      fontSize: '5px',
    });
    this.#addText('DASH H · BLOQUEAR N · ESQUIVAR J · ATAQUE ESPECIAL M', GAME_WIDTH / 2, 231, {
      fontSize: '5px',
    });
    this.#addButton('VOLVER', 245, () => this.#showHome());
    
  }

  #showCredits() {
    this.page = 'credits';
    this.#beginPage('CRÉDITOS', 330, 168);
    this.#addText('Videojuego de pelea retro no oficial.', GAME_WIDTH / 2, 153, {
      fontSize: '5px',
    });
    this.#addText('Experiencia de usuario garantizada.', GAME_WIDTH / 2, 169, {
      fontSize: '5px',
    });
    this.#addText('© 2026 Todos los derechos reservados', GAME_WIDTH / 2, 188, {
      fontSize: '5px',
      color: '#c4bbd2',
    });
    this.#addText('Diseño y Programación por', GAME_WIDTH / 2, 204, {
      fontSize: '5px',
      color: '#c4bbd2',
    });
    const author = this.#addText('Lucas Montenegro ®', GAME_WIDTH / 2, 218, {
      fontSize: '6px',
      color: '#f2c77e',
    }).setInteractive({ useHandCursor: true });
    author.on('pointerover', () => author.setColor('#fff1bc'));
    author.on('pointerout', () => author.setColor('#f2c77e'));
    author.on('pointerdown', () => {
      window.open('https://www.linkedin.com/in/l-montenegro/', '_blank', 'noopener,noreferrer');
    });
    this.#addButton('VOLVER', 239, () => this.#showHome());
  }
}
