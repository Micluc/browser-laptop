/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this file,
* You can obtain one at http://mozilla.org/MPL/2.0/. */

const React = require('react')
const {StyleSheet, css} = require('aphrodite/no-important')
const Immutable = require('immutable')

// Components
const ReduxComponent = require('../reduxComponent')
const Favicon = require('./content/favIcon')
const AudioTabIcon = require('./content/audioTabIcon')
const NewSessionIcon = require('./content/newSessionIcon')
const PrivateIcon = require('./content/privateIcon')
const TabTitle = require('./content/tabTitle')
const CloseTabIcon = require('./content/closeTabIcon')
const {NotificationBarCaret} = require('../main/notificationBar')

// Actions
const appActions = require('../../../../js/actions/appActions')
const windowActions = require('../../../../js/actions/windowActions')

// Store
const windowStore = require('../../../../js/stores/windowStore')

// State helpers
const privateState = require('../../../common/state/tabContentState/privateState')
const audioState = require('../../../common/state/tabContentState/audioState')
const tabUIState = require('../../../common/state/tabUIState')
const tabState = require('../../../common/state/tabState')

// Constants
const settings = require('../../../../js/constants/settings')
const dragTypes = require('../../../../js/constants/dragTypes')

// Styles
const globalStyles = require('../styles/global')
const {theme} = require('../styles/theme')

// Utils
const {getTextColorForBackground} = require('../../../../js/lib/color')
const {isIntermediateAboutPage} = require('../../../../js/lib/appUrlUtil')
const contextMenus = require('../../../../js/contextMenus')
const dnd = require('../../../../js/dnd')
const frameStateUtil = require('../../../../js/state/frameStateUtil')
const {hasTabAsRelatedTarget} = require('../../lib/tabUtil')
const isWindows = require('../../../common/lib/platformUtil').isWindows()
const {getCurrentWindowId} = require('../../currentWindow')
const {setObserver} = require('../../lib/observerUtil')
const UrlUtil = require('../../../../js/lib/urlutil')
const {getSetting} = require('../../../../js/settings')

class Tab extends React.Component {
  constructor (props) {
    super(props)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseEnter = this.onMouseEnter.bind(this)
    this.onMouseLeave = this.onMouseLeave.bind(this)
    this.onDrag = this.onDrag.bind(this)
    this.onDragStart = this.onDragStart.bind(this)
    this.onDragEnd = this.onDragEnd.bind(this)
    this.onDragOver = this.onDragOver.bind(this)
    this.onClickTab = this.onClickTab.bind(this)
    this.onObserve = this.onObserve.bind(this)
    this.onTabClosedWithMouse = this.onTabClosedWithMouse.bind(this)
    this.tabNode = null
    this.mouseTimeout = null
  }

  get frame () {
    return windowStore.getFrame(this.props.frameKey)
  }

  get draggingOverData () {
    const draggingOverData = this.props.dragData && this.props.dragData.get('dragOverData')
    if (!draggingOverData ||
        draggingOverData.get('draggingOverKey') !== this.props.tabId ||
        draggingOverData.get('draggingOverWindowId') !== getCurrentWindowId()) {
      return
    }

    const sourceDragData = dnd.getInterBraveDragData()
    if (!sourceDragData) {
      return
    }
    const location = sourceDragData.get('location')
    const tabId = draggingOverData.get('draggingOverKey')
    const draggingOverFrame = windowStore.getFrameByTabId(tabId)
    if ((location === 'about:blank' || location === 'about:newtab' || isIntermediateAboutPage(location)) &&
        (draggingOverFrame && draggingOverFrame.get('pinnedLocation'))) {
      return
    }

    return draggingOverData
  }

  get isDragging () {
    const sourceDragData = dnd.getInterBraveDragData()
    return sourceDragData &&
      sourceDragData.get('tabId') === this.props.tabId &&
      sourceDragData.get('draggingOverWindowId') === getCurrentWindowId()
  }

  get isDraggingOverSelf () {
    const draggingOverData = this.props.dragData && this.props.dragData.get('dragOverData')
    const sourceDragData = dnd.getInterBraveDragData()
    if (!draggingOverData || !sourceDragData) {
      return false
    }
    return draggingOverData.get('draggingOverKey') === sourceDragData.get('tabId')
  }

  get isDraggingOverLeft () {
    if (!this.draggingOverData) {
      return false
    }
    return this.draggingOverData.get('draggingOverLeftHalf')
  }

  get isDraggingOverRight () {
    if (!this.draggingOverData) {
      return false
    }
    return this.draggingOverData.get('draggingOverRightHalf')
  }

  onDragStart (e) {
    if (this.frame) {
      // showing up the sentinel while dragging leads to show the shadow
      // of the next tab. See 10691#issuecomment-329854096
      // this is added back to original size when onDrag event is happening
      this.tabSentinel.style.width = 0

      dnd.onDragStart(dragTypes.TAB, this.frame, e)
      // cancel tab preview while dragging. see #10103
      windowActions.setTabHoverState(this.props.frameKey, false, false)
    }
  }

  onDrag () {
    // re-enable the tabSentinel while dragging
    this.tabSentinel.style.width = globalStyles.spacing.sentinelSize
  }

  onDragEnd (e) {
    if (this.frame) {
      dnd.onDragEnd(dragTypes.TAB, this.frame, e)
    }
  }

  onDragOver (e) {
    dnd.onDragOver(dragTypes.TAB, this.tabNode.getBoundingClientRect(), this.props.tabId, this.draggingOverData, e)
  }

  onMouseLeave (e) {
    // mouseleave will keep the previewMode
    // as long as the related target is another tab
    clearTimeout(this.mouseTimeout)
    windowActions.setTabHoverState(this.props.frameKey, false, hasTabAsRelatedTarget(e))
  }

  onMouseEnter (e) {
    // if mouse entered a tab we only trigger a new preview
    // if user is in previewMode, which is defined by mouse move
    clearTimeout(this.mouseTimeout)
    windowActions.setTabHoverState(this.props.frameKey, true, this.props.previewMode)
    // In case there's a tab preview happening, cancel the preview
    // when mouse is over a tab
    windowActions.setTabPageHoverState(this.props.tabPageIndex, false)
  }

  onMouseMove () {
    // dispatch a message to the store so it can delay
    // and preview the tab based on mouse idle time
    clearTimeout(this.mouseTimeout)
    this.mouseTimeout = setTimeout(
      () => {
        windowActions.setTabHoverState(this.props.frameKey, true, true)
      },
      getSetting(settings.TAB_PREVIEW_TIMING))
  }

  onAuxClick (e) {
    this.onClickTab(e)
  }

  onTabClosedWithMouse (event) {
    event.stopPropagation()
    const frame = this.frame

    if (frame && !frame.isEmpty()) {
      // do not mimic tab size if closed tab is a pinned tab
      if (!this.props.isPinnedTab) {
        const tabWidth = this.fixTabWidth
        windowActions.onTabClosedWithMouse({
          fixTabWidth: tabWidth
        })
      }
      appActions.tabCloseRequested(this.props.tabId)
    }
  }

  onClickTab (e) {
    switch (e.button) {
      case 2:
        // Ignore right click
        return
      case 1:
        // Close tab with middle click
        this.onTabClosedWithMouse(e)
        break
      default:
        e.stopPropagation()
        appActions.tabActivateRequested(this.props.tabId)
    }
  }

  componentDidMount () {
    // unobserve tabs that we don't need. This will
    // likely be made by onObserve method but added again as
    // just to double-check
    if (this.props.isPinned) {
      this.observer && this.observer.unobserve(this.tabSentinel)
    }
    const threshold = Object.values(globalStyles.intersection)
    // At this moment Chrome can't handle unitless zeroes for rootMargin
    // see https://github.com/w3c/IntersectionObserver/issues/244
    const margin = '0px'
    this.observer = setObserver(this.tabSentinel, threshold, margin, this.onObserve)
    this.observer.observe(this.tabSentinel)

    this.tabNode.addEventListener('auxclick', this.onAuxClick.bind(this))
  }

  componentWillUnmount () {
    this.observer.unobserve(this.tabSentinel)
    clearTimeout(this.mouseTimeout)
  }

  onObserve (entries) {
    if (this.props.isPinnedTab) {
      return
    }
    // we only have one entry
    const entry = entries[0]
    windowActions.setTabIntersectionState(this.props.frameKey, entry.intersectionRatio)
  }

  get fixTabWidth () {
    if (!this.tabNode) {
      return 0
    }

    const rect = this.elementRef.getBoundingClientRect()
    return rect && rect.width
  }

  mergeProps (state, ownProps) {
    const currentWindow = state.get('currentWindow')
    const frame = frameStateUtil.getFrameByKey(currentWindow, ownProps.frameKey) || Immutable.Map()
    const frameKey = ownProps.frameKey
    const tabId = frame.get('tabId', tabState.TAB_ID_NONE)
    const isPinned = tabState.isTabPinned(state, tabId)
    const partOfFullPageSet = ownProps.partOfFullPageSet

    // TODO: this should have its own method
    const notifications = state.get('notifications')
    const notificationOrigins = notifications ? notifications.map(bar => bar.get('frameOrigin')) : false
    const notificationBarActive = frame.get('location') && notificationOrigins &&
      notificationOrigins.includes(UrlUtil.getUrlOrigin(frame.get('location')))

    const props = {}
    // TODO: this should have its own method
    props.notificationBarActive = notificationBarActive
    props.frameKey = frameKey
    props.isPinnedTab = isPinned
    props.isPrivateTab = privateState.isPrivateTab(currentWindow, frameKey)
    props.isActive = frameStateUtil.isFrameKeyActive(currentWindow, frameKey)
    props.isPreview = frameKey === frameStateUtil.getPreviewFrameKey(currentWindow) /* || frameKey === 2 */ // <-- uncomment to force 1 preview tab for style inspection
    props.tabWidth = isPinned ? null : currentWindow.getIn(['ui', 'tabs', 'fixTabWidth'])
    props.themeColor = tabUIState.getThemeColor(currentWindow, frameKey)
    props.title = frame.get('title')
    props.tabPageIndex = frameStateUtil.getTabPageIndex(currentWindow)
    props.partOfFullPageSet = partOfFullPageSet
    props.showAudioTopBorder = audioState.showAudioTopBorder(currentWindow, frameKey, isPinned)
    props.centralizeTabIcons = tabUIState.centralizeTabIcons(currentWindow, frameKey, isPinned)
    // required only so that context menu shows correct state (mute vs unmute)
    props.isAudioMuted = audioState.isAudioMuted(currentWindow, frameKey)
    props.isAudio = audioState.canPlayAudio(currentWindow, frameKey)

    // used in other functions
    props.dragData = state.getIn(['dragData', 'type']) === dragTypes.TAB && state.get('dragData')
    props.tabId = tabId
    props.previewMode = currentWindow.getIn(['ui', 'tabs', 'previewMode'])

    return props
  }

  componentDidUpdate (prevProps) {
    if (prevProps.tabWidth && !this.props.tabWidth && !this.props.partOfFullPageSet) {
      this.elementRef.animate([
          { flexBasis: `${prevProps.tabWidth}px`, flexGrow: 0, flexShrink: 0 },
          { flexBasis: 0, flexGrow: 1, flexShrink: 1 }
      ], {
        duration: 250,
        iterations: 1,
        easing: 'ease-in-out'
      })
    }
  }

  render () {
    // we don't want themeColor if tab is private
    const isThemed = !this.props.isPrivateTab && this.props.isActive && this.props.themeColor
    const instanceStyles = { }
    if (isThemed) {
      instanceStyles['--theme-color-fg'] = getTextColorForBackground(this.props.themeColor)
      instanceStyles['--theme-color-bg'] = this.props.themeColor
    }
    if (this.props.tabWidth) {
      instanceStyles.flex = `0 0 ${this.props.tabWidth}px`
    }
    return <div
      data-tab-area
      className={css(
        styles.tabArea,
        (this.isDraggingOverLeft && !this.isDraggingOverSelf) && styles.tabArea_dragging_left,
        (this.isDraggingOverRight && !this.isDraggingOverSelf) && styles.tabArea_dragging_right,
        this.isDragging && styles.tabArea_isDragging,
        this.props.isPinnedTab && styles.tabArea_isPinned,
        (this.props.partOfFullPageSet || !!this.props.tabWidth) && styles.tabArea_partOfFullPageSet,
        this.props.isPreview && styles.tabArea_isPreview,
        // Windows specific style (color)
        isWindows && styles.tabArea__tab_forWindows,
        // Set background-color and color to active tab and private tab
        this.props.isActive && styles.tabArea_isActive,
        this.props.isPrivateTab && styles.tabArea_private,
        (this.props.isPrivateTab && this.props.isActive) && styles.tabArea_private_active,
        // Apply themeColor if tab is active and not private
        isThemed && styles.tabArea_themed,
        this.props.isPreview && styles.tabArea_isPreview
      )}
      style={instanceStyles}
      onMouseMove={this.onMouseMove}
      onMouseEnter={this.onMouseEnter}
      onMouseLeave={this.onMouseLeave}
      data-test-id='tab-area'
      data-tab-id={this.props.tabId}
      data-frame-key={this.props.frameKey}
      ref={elementRef => { this.elementRef = elementRef }}
      >
      {
        this.props.isActive && this.props.notificationBarActive
          ? <NotificationBarCaret />
          : null
      }
      <div
        data-tab
        ref={(node) => { this.tabNode = node }}
        className={css(
          styles.tabArea__tab,
          // tab icon only (on pinned tab / small tab)
          this.props.isPinnedTab && styles.tabArea__tab_pinned,
          this.props.centralizeTabIcons && styles.tabArea__tab_centered,
          this.props.showAudioTopBorder && styles.tabArea__tab_audioTopBorder
        )}
        data-test-id='tab'
        data-test-active-tab={this.props.isActive}
        data-test-pinned-tab={this.props.isPinnedTab}
        data-test-private-tab={this.props.isPrivateTab}
        data-frame-key={this.props.frameKey}
        draggable
        title={this.props.isPreview ? null : this.props.title}
        onDrag={this.onDrag}
        onDragStart={this.onDragStart}
        onDragEnd={this.onDragEnd}
        onDragOver={this.onDragOver}
        onClick={this.onClickTab}
        onContextMenu={contextMenus.onTabContextMenu.bind(this, this.frame)}
      >
        <div
          ref={(node) => { this.tabSentinel = node }}
          className={css(styles.tabArea__tab__sentinel)}
        />
        <div className={css(
          styles.tabArea__tab__identity,
          this.props.centralizeTabIcons && styles.tabArea__tab__identity_centered
        )}>
          <Favicon tabId={this.props.tabId} />
          <AudioTabIcon tabId={this.props.tabId} />
          <TabTitle tabId={this.props.tabId} />
        </div>
        <PrivateIcon tabId={this.props.tabId} />
        <NewSessionIcon tabId={this.props.tabId} />
        <CloseTabIcon tabId={this.props.tabId} onClick={this.onTabClosedWithMouse} />
      </div>
    </div>
  }
}

const styles = StyleSheet.create({
  tabArea: {
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
    flex: '1 1 0',
    '--tab-margin-top': `-${theme.tab.borderWidth}px`,
    // put the top border underneath tab-stip top border, and
    // the left border underneath the previous tab's right border
    margin: `var(--tab-margin-top) 0 0 -${theme.tab.borderWidth}px`,
    border: `solid var(--tab-border-width, ${theme.tab.borderWidth}px) var(--tab-border-color)`,
    // Border bottom is added to the tabArea__tab so that we do not get
    // 45-degree angles when the bottom border is different color from the side borders.
    // This could change when we can put the tab's background on this element,
    // which can happen when tab dragging does not introduce a left/right 'space' when a tab
    // is dragged over.
    borderBottomWidth: `0 !important`, // aphrodite puts this above the border defined in the previous line, so use important :-(
    zIndex: 100,
    transformOrigin: 'bottom center',
    minWidth: 0,
    width: 0,
    // no-drag is applied to the button and tab area
    // ref: tabs__tabStrip__newTabButton on tabs.js
    WebkitAppRegion: 'no-drag',
    // There's a special case that tabs should span the full width
    // if there are a full set of them.
    maxWidth: '184px',
    // Use css variables for some transition options so that we can change them
    // with other classes below, without having to re-define the whole property.
    // Avoid aphrodite bug which will change css variables
    // to --tab--webkit-transition-duration by calling it 'transit'.
    '--tab-transit-duration': theme.tab.transitionDurationOut,
    '--tab-transit-easing': theme.tab.transitionEasingOut,
    // z-index should be delayed when it changes, so that preview tab stays on top until
    // its scale transition has completed
    '--tab-zindex-delay': 'var(--tab-transit-duration)',
    transition: ['box-shadow', 'transform', 'border', 'margin']
      .map(prop => `${prop} var(--tab-transit-duration) var(--tab-transit-easing) 0s`)
      .join(',') +
      ', z-index 0s linear var(--tab-zindex-delay)',
    '--tab-background': theme.tab.background,
    '--tab-color': theme.tab.color,
    '--tab-border-color': theme.tab.borderColor,
    ':hover': {
      '--tab-background': `var(--tab-background-hover, ${theme.tab.hover.background})`,
      '--tab-color': `var(--tab-color-hover, ${theme.tab.color})`,
      '--tab-border-color': `var(--tab-border-color-hover, ${theme.tab.borderColor})`,
      '--tab-transit-duration': theme.tab.transitionDurationIn,
      '--tab-transit-easing': theme.tab.transitionEasingIn
    }
  },

  tabArea_dragging_left: {
    paddingLeft: globalStyles.spacing.dragSpacing
  },

  tabArea_dragging_right: {
    paddingRight: globalStyles.spacing.dragSpacing
  },

  tabArea_isDragging: {
    opacity: 0.2,
    paddingLeft: 0,
    paddingRight: 0
  },

  tabArea_isPinned: {
    flex: 'initial',
    width: 'auto'
  },

  tabArea_partOfFullPageSet: {
    maxWidth: 'initial'
  },

  tabArea_isActive: {
    zIndex: 300,
    '--tab-background': theme.tab.active.background,
    '--tab-background-hover': theme.tab.hover.active.background,
    '--tab-border-color-bottom': 'var(--tab-background)',
    '--tab-transit-duration': theme.tab.transitionDurationIn,
    '--tab-transit-easing': theme.tab.transitionEasingIn
  },

  tabArea_isPreview: {
    '--tab-background': theme.tab.preview.background,
    '--tab-background-hover': theme.tab.preview.background,
    '--tab-color': theme.tab.color,
    '--tab-color-hover': theme.tab.color,
    '--tab-border-color': theme.tab.preview.background,
    '--tab-border-color-hover': theme.tab.preview.background,
    zIndex: 310,
    transform: `scale(${theme.tab.preview.scale})`,
    boxShadow: theme.tab.preview.boxShadow,
    // want the zindex to change immediately when previewing, but delay when un-previewing
    '--tab-zindex-delay': '0s',
    '--tab-transit-duration': theme.tab.transitionDurationIn,
    '--tab-transit-easing': theme.tab.transitionEasingIn
  },

  tabArea_forWindows: {
    '--tab-color': theme.tab.forWindows.color
  },

  tabArea_private: {
    '--tab-background': theme.tab.private.background,
    '--tab-background-hover': theme.tab.active.private.background,
    '--tab-color-hover': theme.tab.active.private.color,
    '--tab-border-color-hover': theme.tab.hover.private.borderColor
  },

  tabArea_private_active: {
    '--tab-background': theme.tab.active.private.background,
    '--tab-color': theme.tab.active.private.color,
    '--tab-background-hover': theme.tab.active.private.background,
    '--tab-color-hover': theme.tab.active.private.color
  },

  tabArea_themed: {
    '--tab-color': `var(--theme-color-fg)`,
    '--tab-background': `var(--theme-color-bg)`,
    '--tab-background-hover': 'var(--theme-color-bg)',
    '--tab-color-hover': 'var(--theme-color-fg)'
  },

  tabArea__tab: {
    boxSizing: 'border-box',
    background: `var(--tab-background, ${theme.tab.background})`,
    display: 'flex',
    paddingBottom: 0, // explicitly defined for transition on active
    transition: ['background-color', 'color', 'border']
      .map(prop => `${prop} var(--tab-transit-duration) var(--tab-transit-easing) 0s`)
      .join(','),
    height: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    color: `var(--tab-color, ${theme.tab.color})`,
    borderBottom: `solid var(--tab-border-width, ${theme.tab.borderWidth}px) var(--tab-border-color-bottom, var(--tab-border-color))`
  },

  tabArea__tab_audioTopBorder: {
    '::before': {
      zIndex: globalStyles.zindex.zindexTabsAudioTopBorder,
      content: `''`,
      display: 'block',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '2px',
      background: 'lightskyblue'
    }
  },

  tabArea__tab_pinned: {
    padding: 0,
    width: '28px',
    justifyContent: 'center'
  },

  tabArea__tab_centered: {
    flex: 'auto',
    justifyContent: 'center',
    padding: 0,
    margin: 0
  },

  // The sentinel is responsible to respond to tabs
  // intersection state. This is an empty hidden element
  // which `width` value shouldn't be changed unless the intersection
  // point needs to be edited.
  tabArea__tab__sentinel: {
    position: 'absolute',
    left: 0,
    height: '1px',
    background: 'transparent',
    width: globalStyles.spacing.sentinelSize
  },

  tabArea__tab__identity: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    overflow: 'visible',
    display: 'flex',
    flex: '1',
    minWidth: '0', // @see https://bugzilla.mozilla.org/show_bug.cgi?id=1108514#c5
    // can't do 'ancestor:hover child' selector in aphrodite, so cascade a variable
    margin: `0 6px 0 ${globalStyles.spacing.defaultTabMargin}`, // bring the right margin closer as we do fade-out
    transition: 'margin var(--tab-transit-duration) var(--tab-transit-easing)'
  },

  tabArea__tab__identity_centered: {
    justifyContent: 'center',
    flex: 'auto',
    padding: 0,
    margin: 0
  }
})

module.exports = ReduxComponent.connect(Tab)
