/**
 * Client attrs that discourage browser / extension “save media” affordances.
 * Does not make media uncopyable — only reduces casual download UI (e.g. IDM overlays on thumbs).
 */
export const MEDIA_PROTECT_ELEMENT_PROPS = {
  controlsList: 'nodownload noremoteplayback noplaybackrate',
  disablePictureInPicture: true,
  draggable: false,
  onContextMenu: (event) => {
    event.preventDefault();
  },
};

export const MEDIA_PROTECT_IMAGE_PROPS = {
  draggable: false,
  onContextMenu: (event) => {
    event.preventDefault();
  },
  style: {
    WebkitUserDrag: 'none',
    userSelect: 'none',
    WebkitTouchCallout: 'none',
  },
};
