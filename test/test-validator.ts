// Copyright 2013 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { assert } from 'chai';

import { MutationSummary } from '../src/mutation-summary';

export function compareNodeArrayIgnoreOrder(expected, actual) {
  assert.strictEqual(expected.length, actual.length);
  var map = new MutationSummary.NodeMap();
  expected.forEach(function (node) {
      map.set(node, true);
  });
  actual.forEach(function (node) {
      assert.isTrue(map.has(node));
  });
}

export function createQueryValidator(root, query) {
  var matchesSelector = 'matchesSelector';
  if ('webkitMatchesSelector' in Element.prototype)
    matchesSelector = 'webkitMatchesSelector';
  else if ('mozMatchesSelector' in Element.prototype)
    matchesSelector = 'mozMatchesSelector';


  if (query.all) {
    var allFilter = function allFilter(node) {
      return typeof node.appendChild == 'function';
    };

    var allData = function allData(node) {
      var oldPreviousSiblingMap = new MutationSummary.NodeMap;

      for (var child = node.firstChild; child; child = child.nextSibling)
        oldPreviousSiblingMap.set(child, child.previousSibling);

      return oldPreviousSiblingMap;
    };

    var allValidator = function allValidator(summary, stayed, old, current) {
      summary.reordered.forEach(function(node) {
        var oldPreviousSiblingMap = old.get(summary.getOldParentNode(node));
        assert.strictEqual(oldPreviousSiblingMap.get(node), summary.getOldPreviousSibling(node));
      });
    };

    return new Validator(root, allFilter, allData, allValidator);
  }

  if (query.characterData) {
    var textNodeFilter = function textNodeFilter(node) {
      return node.nodeType == Node.TEXT_NODE || node.nodeType == Node.COMMENT_NODE;
    };

    var textNodeData = function textNodeData(node) {
      return node.textContent;
    };

    var textNodeValidator = function textNodeValidator(summary, stayed, old, current) {
      var changed = stayed.filter(function(node) {
        return old.get(node) != current.get(node);
      });

      compareNodeArrayIgnoreOrder(changed, summary.valueChanged);

      changed.forEach(function(node) {
        assert.strictEqual(old.get(node), summary.getOldCharacterData(node));
      });
    };

    return new Validator(root, textNodeFilter, textNodeData, textNodeValidator);
  }

  if (query.attribute) {
    var attributeFilter = function attributeFilter(node) {
      return node.nodeType == Node.ELEMENT_NODE && node.hasAttribute(query.attribute);
    };

    var attributeData = function attributeData(node) {
      return node.getAttribute(query.attribute);
    };

    var attributeValidator = function attributeValidator(summary, stayed, old, current) {
      var changed = stayed.filter(function(node) {
        return old.get(node) != current.get(node);
      });

      compareNodeArrayIgnoreOrder(changed, summary.valueChanged);

      changed.forEach(function(node) {
        assert.strictEqual(old.get(node), summary.getOldAttribute(node, query.attribute));
      });
    };

    return new Validator(root, attributeFilter, attributeData, attributeValidator);
  }

  if (query.element) {
    var elementFilter = function elementFilter(node) {
      if (node.nodeType != Node.ELEMENT_NODE)
        return false;
      return query.elementFilter.some(function(pattern) {
        return node[matchesSelector](pattern.selectorString);
      });
    };

    var elementData = function elementData(node) {

      var caseInsensitive = node instanceof HTMLElement &&
                            node.ownerDocument instanceof HTMLDocument;

      var data = {
        parentNode: node.parentNode,
        attributes: undefined
      };

      if (!query.elementAttributes)
        return data;

      data.attributes = {};
      query.elementAttributes.forEach(function(attrName) {
        data.attributes[attrName] = node.getAttribute(attrName);
      });

      return data;
    };

    var elementValidator = function elementValidator(summary, stayed, old, current) {
      var attributeChanged = {};
      if (query.elementAttributes) {
        query.elementAttributes.forEach(function(attrName) {
          attributeChanged[attrName] = [];
        });
      }
      var reparented = [];

      stayed.forEach(function(node) {
        var oldData = old.get(node);
        var data = current.get(node);

        if (oldData.parentNode != data.parentNode)
          reparented.push(node);

        if (!query.elementAttributes)
          return;

        query.elementAttributes.forEach(function(attrName) {
          if (oldData.attributes[attrName] != data.attributes[attrName])
            attributeChanged[attrName].push(node);
        });
      });

      compareNodeArrayIgnoreOrder(reparented, summary.reparented);
      if (!query.elementAttributes)
        return;

      Object.keys(summary.attributeChanged).forEach(function(attrName) {
        compareNodeArrayIgnoreOrder(attributeChanged[attrName],
                                    summary.attributeChanged[attrName]);

        attributeChanged[attrName].forEach(function(node) {
          node(old.get(node).attributes[attrName], summary.getOldAttribute(node, attrName));
        });
      });

      function checkOldParentNode(node) {
        assert.strictEqual(old.get(node).parentNode, summary.getOldParentNode(node));
      }

      summary.removed.forEach(checkOldParentNode);
      summary.reparented.forEach(checkOldParentNode);
    }

    return new Validator(root, elementFilter, elementData, elementValidator);
  }
}

function Validator(root, includeFunc, dataFunc, validateFunc) {

  var collectNodeMap = function collectNodeMap(node, includeFunc, dataFunc, map = new MutationSummary.NodeMap) {
    if (includeFunc(node))
      map.set(node, dataFunc(node));

    if (!node.childNodes || !node.childNodes.length)
      return map;

    for (var i = 0; i < node.childNodes.length; i++)
      collectNodeMap(node.childNodes[i], includeFunc, dataFunc, map);

    return map;
  }

  this.recordPreviousState = function() {
    this.current = collectNodeMap(root, includeFunc, dataFunc)
  };

  this.validate = function(summary) {
    var old = this.current;
    this.current = collectNodeMap(root, includeFunc, dataFunc);

    var currentCopy = new MutationSummary.NodeMap;
    this.current.keys().forEach(function(node) {
      currentCopy.set(node, this.current.get(node));
    }, this);

    var stayed = [];
    var removed = [];
    old.keys().forEach(function(node) {
      if (currentCopy.has(node))
        stayed.push(node);
      else
        removed.push(node);

      currentCopy.delete(node);
    });

    var added = currentCopy.keys();

    compareNodeArrayIgnoreOrder(added, summary.added);
    compareNodeArrayIgnoreOrder(removed, summary.removed);

    validateFunc(summary, stayed, old, this.current);
  }
}
