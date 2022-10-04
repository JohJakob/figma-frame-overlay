const storageKey = 'overlay_colors';
const noSelectionMessage = 'You have not selected anything.';
const saveColorInvalidFillMessage = 'This layer does not have a fill that can be saved as a custom overlay fill.';
const saveColorSuccessMessage = 'Saved custom overlay fill ';
const saveColorErrorMessage = 'Could not save custom overlay fill. Error: ';
const saveColorAlreadySavedMessage = 'This fill is already saved.';
const removeColorSuccessMessage = 'Removed custom overlay fill.';
const removeColorNoColorsMessage = 'There are no custom overlay fills.';

const overlayName = 'Overlay';
const topLayerNames = ['sheet', 'modal', 'popover', 'alert', 'statusbar', 'keyboard', 'dynamicisland', 'contextualmenu', 'appclip', 'notification', 'faceid', 'touchid'];

const componentToHex = (c) => {
  // Convert float colour value to integer value
  let intColor = c >= 1 ? 255 : Math.floor(c * 256);

  // Convert colour value to hexadecimal value
  let hex = intColor.toString(16);
  hex = hex.toUpperCase();

  return hex.length === 1 ? '0' + hex : hex;
}

figma.parameters.on('input', async ({ key, query, result }) => {
  switch (key) {
    case 'color':
      const presetColors = [{ name: 'Black', data: { r: 0, g: 0, b: 0 }}, { name: 'White', data: { r: 1, g: 1, b: 1 }}];

      // Set suggestions for colour parameter
      await figma.clientStorage.getAsync(storageKey).then(
        value => {
          if (value !== undefined && value.length > 0) {
            // Add custom overlay colours to suggestions
            result.setSuggestions(value.concat(presetColors).filter(s => s.name.includes(query)));
          } else {
            // Only use preset overlay fills when no custom colours are available
            result.setSuggestions(presetColors.filter(s => s.name.includes(query)));
          }
        },
        _error => {
          result.setSuggestions(presetColors.filter(s => s.name.includes(query)));
        }
      );
      break;
    case 'opacity':
      // Set suggestions for opacity parameter
      const opacities = [{ name: '50%', data: 0.5 }, { name: '25%', data: 0.25 }, { name: '75%', data: 0.75 }, { name: '100%', data: 1 }, { name: '10%', data: 0.1 }];
      
      result.setSuggestions(opacities.filter(s => s.name.includes(query)));
      break;
    case 'colorToRemove':
      await figma.clientStorage.getAsync(storageKey).then(
        value => {
          if (value !== undefined && value.length > 0) {
            result.setSuggestions(value.filter(s => s.name.includes(query)));
          } else {
            result.setError(removeColorNoColorsMessage);
          }
        },
        error => {
          figma.closePlugin('Could not load custom overlay colours. Error: ' + error);
        }
      );
      break;
    default:
      break;
  }
});

figma.on('run', async ({ command, parameters }) => {
  switch (command) {
    case 'create_overlay':
      // Process selection
      await createOverlay(figma.currentPage.selection, parameters.color, parameters.opacity);
      break;
    case 'save_color':
      // Save current fill as custom overlay fill
      await saveColor(figma.currentPage.selection);
      break;
    case 'remove_color':
      // Remove selected custom overlay fill
      await removeColor(parameters.colorToRemove);
      break;
    default:
      break;
  }

  figma.closePlugin();
});

const createOverlay = async (selection, color, opacity) => {
  if (figma.currentPage.selection.length === 0) {
    figma.closePlugin(noSelectionMessage);
  }

  for (const node of selection) {
    // Only process visible frame nodes
    if (node.visible) {
      if (node.type === 'FRAME' || node.type === 'COMPONENT') {
        const existingOverlay = node.findChild(n => n.name === overlayName);

        if (existingOverlay !== null) {
          // Update fill when overlay already exists
          await applyFill(existingOverlay, color, opacity);
        } else {
          const overlay = figma.createFrame();
          
          overlay.name = overlayName;
          
          overlay.x = 0;
          overlay.y = 0;
          
          overlay.resize(node.width - node.paddingLeft - node.paddingRight, node.height - node.paddingTop - node.paddingBottom);
          overlay.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
          
          // Find the first layer that may be intended to be above the overlay
          const existingTopLayer = node.findChild(n => topLayerNames.some(e => n.name.toLowerCase().replace(/\s+/g, '').includes(e)));
          
          if (existingTopLayer !== undefined && existingTopLayer !== null) {
            const index = node.children.indexOf(existingTopLayer);
            
            // Insert overlay below top layer
            if (index > -1) {
              node.insertChild(index, overlay);
            } else {
              node.appendChild(overlay);
            }
          } else {
            node.appendChild(overlay);
          }
          
          if (node.layoutMode !== 'NONE') {
            overlay.layoutPositioning = 'ABSOLUTE';
          }
          
          await applyFill(overlay, color, opacity);
        }
      }
    }
  }
}

const applyFill = async (node, color, opacity) => {
  if ('key' in color) {
    if (color.remote === true) {
      // Import remote fill style from team library
      await figma.importStyleByKeyAsync(color.key.toString()).then(
        value => {
          // Apply remote fill style
          node.fillStyleId = value.id;
        },
        _error => {
          figma.closePlugin('The selected overlay fill style could not be found in your team library.');
        }
      );
    } else {
      // Apply local fill style
      const style = figma.getStyleById(color.key);

      if (style !== undefined && style !== null) {
        node.fillStyleId = figma.getStyleById(color.key).id;
      } else {
        figma.closePlugin('The selected overlay fill style could not be found.');
      }
    }

    if (opacity !== undefined) {
      if (typeof opacity === 'string') {
        let opacityNumber = parseFloat(opacity);

        if (opacityNumber >= 1) {
          opacityNumber = opacityNumber / 100;
          opacityNumber = opacityNumber > 1 ? 1 : opacityNumber;
        }

        node.opacity = opacityNumber;
      } else {
        node.opacity = opacity;
      }
    }
  } else if ('type' in color) {
    // Apply custom overlay fill
    let fill = [color];

    if (opacity !== undefined) {
      if (typeof opacity === 'string') {
        let opacityNumber = parseFloat(opacity);

        if (opacityNumber >= 1) {
          opacityNumber = opacityNumber / 100;
          opacityNumber = opacityNumber > 1 ? 1 : opacityNumber;
        }

        fill[0].opacity = opacityNumber;
      } else {
        fill[0].opacity = opacity;
      }
    }

    node.fills = fill;
  } else {
    // Apply preset overlay fill
    let fill: any[];

    fill = [{ color: color }];
    fill[0].type = 'SOLID';

    if (opacity !== undefined) {
      if (typeof opacity === 'string') {
        let opacityNumber = parseFloat(opacity);

        if (opacityNumber >= 1) {
          opacityNumber = opacityNumber / 100;
          opacityNumber = opacityNumber > 1 ? 1 : opacityNumber;
        }

        fill[0].opacity = opacityNumber;
      } else {
        fill[0].opacity = opacity;
      }
    }

    node.fills = fill;
  }
}

const saveColor = async (selection) => {
  if (selection.length === 0) {
    figma.closePlugin(noSelectionMessage);
  }

  for (const node of selection) {
    if (node.visible) {
      if (node.fillStyleId !== undefined && node.fillStyleId.length > 0) {
        const colorName = figma.getStyleById(node.fillStyleId).name;
        const style = figma.getStyleById(node.fillStyleId);
        const newColor = [{ name: colorName, data: undefined }];

        // Save fill style as overlay fill
        if (style.remote) {
          newColor[0].data = { key: style.key, remote: style.remote };
        } else {
          newColor[0].data = { key: style.id, remote: style.remote };
        }

        await figma.clientStorage.getAsync(storageKey).then(
          async value => {
            if (value !== undefined) {
              if (value.some(e => JSON.stringify(e) === JSON.stringify(newColor[0]))) {
                figma.closePlugin(saveColorAlreadySavedMessage);
              } else {
                await figma.clientStorage.setAsync(storageKey, value ? newColor.concat(value) : newColor).then(
                  _value => {
                    figma.closePlugin(saveColorSuccessMessage + newColor[0].name);
                  },
                  error => {
                    figma.closePlugin(saveColorErrorMessage + error);
                  }
                );
              }
            } else {
              await figma.clientStorage.setAsync(storageKey, newColor).then(
                _value => {
                  figma.closePlugin(saveColorSuccessMessage + newColor[0].name);
                },
                error => {
                  figma.closePlugin(saveColorErrorMessage + error);
                }
              );
            }
          },
          error => {
            figma.closePlugin(saveColorErrorMessage + error);
          }
        );

        // Exit node iteration loop
        continue;
      } else if ('fills' in node) {
        let colorName: string;
        let colorData;

        // Set overlay fill name based on fill type
        node.fills.every(e => {
          if (e.visible) {
            switch (e.type) {
              case 'SOLID':
                colorName = '#' + componentToHex(e.color.r) + componentToHex(e.color.g) + componentToHex(e.color.b);
                colorData = e;
                break;
              case 'GRADIENT_LINEAR':
                colorName = 'Linear Gradient';
                colorData = e;
                break;
              case 'GRADIENT_RADIAL':
                colorName = 'Radial Gradient';
                colorData = e;
                break;
              case 'GRADIENT_ANGULAR':
                colorName = 'Angular Gradient';
                colorData = e;
                break;
              case 'GRADIENT_DIAMOND':
                colorName = 'Diamond Gradient';
                colorData = e;
                break;
              case 'IMAGE':
                colorName = 'Image';
                colorData = e;
                break;
              default:
                break;
            }
          }

          if (colorData !== undefined && colorData !== undefined) {
            return false;
          } else {
            return true;
          }
        });

        if (colorName !== undefined && colorData !== undefined) {
          const newColor = [{ name: colorName, data: colorData }];

          await figma.clientStorage.getAsync(storageKey).then(
            async value => {
              if (value !== undefined) {
                if (value.some(e => JSON.stringify(e) === JSON.stringify(newColor[0]))) {
                  figma.closePlugin(saveColorAlreadySavedMessage);
                } else {
                  await figma.clientStorage.setAsync(storageKey, newColor.concat(value)).then(
                    _value => {
                      figma.closePlugin(saveColorSuccessMessage + colorName + '.');
                    },
                    error => {
                      figma.closePlugin(saveColorErrorMessage + error);
                    }
                  );
                }
              } else {
                await figma.clientStorage.setAsync(storageKey, newColor).then(
                  _value => {
                    figma.closePlugin(saveColorSuccessMessage + newColor[0].name + '.');
                  },
                  error => {
                    figma.closePlugin(saveColorErrorMessage + error);
                  }
                );
              }
            },
            function(error) {
              figma.closePlugin(saveColorErrorMessage + error);
            }
          );

          // Exit node iteration loop
          continue;
        } else {
          figma.closePlugin(saveColorInvalidFillMessage);
        }
      } else {
        figma.closePlugin(saveColorInvalidFillMessage);
      }
    }
  }
}

const removeColor = async (color) => {
  await figma.clientStorage.getAsync(storageKey).then(
    async value => {
      // Remove selected overlay fill from list of saved fills
      const updatedColors = value.filter(e => JSON.stringify(e.data) !== JSON.stringify(color));

      // Send updated list to client storage
      await figma.clientStorage.setAsync(storageKey, updatedColors).then(
        _value => {
          figma.closePlugin(removeColorSuccessMessage);
        },
        error => {
          figma.closePlugin(saveColorErrorMessage + error);
        }
      );
    }
  );
}
