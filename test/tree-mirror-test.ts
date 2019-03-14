import { assert } from 'chai';

import { Query, MutationSummary } from '../src/mutation-summary';
import { TreeMirror, TreeMirrorClient } from '../src/util/tree-mirror';

import { createQueryValidator } from './test-validator';

MutationSummary.createQueryValidator = createQueryValidator;

suite('TreeMirror Fuzzer', function() {

  var testDiv:HTMLElement;

  setup(function() {
    testDiv = document.createElement('div');
    testDiv.id = 'test-div';
  });

  test('Fuzzer', function(async:()=>any) {
    this.timeout(15000);

    var TREE_SIZE = 512;
    var PASSES = 128;
    var MOVES_PER_PASS = 128;
    var NON_DOC_ROOTS_MAX = 4;


    var allNodes:Node[] = []
    var nonRootNodes:Node[] = [];

    // Generate random document.
    randomTree(testDiv, TREE_SIZE);
    getReachable(testDiv, allNodes);
    getReachable(testDiv, nonRootNodes, true);

    // Generate some fragments which lie outside the document.
    var nonDocCount = randInt(1, NON_DOC_ROOTS_MAX);
    for (var i = 0; i < nonDocCount; i++) {
      var nonDoc = <HTMLElement>randomNode();
      nonDoc.id = 'ext' + i;
      randomTree(nonDoc, randInt(Math.floor(TREE_SIZE / 8),
        Math.floor(TREE_SIZE / 4)));
      getReachable(nonDoc, allNodes);
      getReachable(nonDoc, nonRootNodes, true);
    }

    var testingQueries:Query[] = [{ characterData: true} ];

    var attributeQuery:Query = { attribute: randomAttributeName() };
    testingQueries.push(attributeQuery);

    var elementQuery:Query = {
      element: randomTagname() + '[' + randomAttributeName() + ']',
      elementAttributes: randomAttributeName() + ' ' + randomAttributeName()
    };
    testingQueries.push(elementQuery);

    var pass = 0;
    var mirrorRoot = <HTMLElement> testDiv.cloneNode(false);
    var mirrorClient = new TreeMirrorClient(testDiv, new TreeMirror(mirrorRoot), testingQueries);

    function doNextPass() {
      for (var move = 0; move < MOVES_PER_PASS; move++) {
        randomMutation(allNodes, nonRootNodes);
      }

      pass++;

      setTimeout(checkNextPass, 0);
    }

    function checkNextPass() {
      assertTreesEqual(testDiv, mirrorRoot);

      if (pass >= PASSES) {
        mirrorClient.disconnect();
        async();
      } else
        doNextPass();
    };

    doNextPass();
  });

  function testRandomCloneAndTestCopy() {
    randomTree(testDiv, 512);
    var copy = testDiv.cloneNode(true);
    assertTreesEqual(<HTMLElement>testDiv, <HTMLElement>copy);
  }

  function assertTreesEqual(node:HTMLElement, copy:HTMLElement) {
    assert.strictEqual(node.tagName, copy.tagName);
    assert.strictEqual(node.id, copy.id);

    assert.strictEqual(node.nodeType, copy.nodeType);
    if (node.nodeType == Node.ELEMENT_NODE) {
      assert.strictEqual(node.attributes.length, copy.attributes.length);
      for (var i = 0; i < node.attributes.length; i++) {
        var attr = node.attributes[i];
        assert.strictEqual(attr.value, (<Element>copy).getAttribute(attr.name));
      }
    } else {
      assert.strictEqual(node.textContent, copy.textContent);
    }

    assert.strictEqual(node.childNodes.length, copy.childNodes.length);

    var copyChild:Node = copy.firstChild;
    for (var child:Node = node.firstChild; child; child = child.nextSibling) {
      assertTreesEqual(<HTMLElement>child, <HTMLElement>copyChild);
      copyChild = copyChild.nextSibling;
    }
  }

  // This is used because our implementation of Map is just a shim. If keys
  // in our map have a magical __id__ property, then access becomes constant
  // rather than linear.
  var nodePrivateIdCounter = 2;

  function randomTree(root:Node, numNodes:number) {
    var MAX_CHILDREN = 8;

    function randDist(count:number, amount:number) {
      var buckets:number[] = [];

      while(count-- > 0)
        buckets[count] = 0;

      while (amount > 0) {
        var add = randInt(0, 1);
        buckets[randInt(0, buckets.length - 1)] += add;
        amount -= add;
      }

      return buckets;
    }

    if (numNodes <= 0)
      return;

    var childCount = Math.min(numNodes, MAX_CHILDREN);
    var childDist = randDist(childCount, numNodes - childCount);
    for (var i = 0; i < childDist.length; i++) {
      var maybeText = childDist[i] <= 1;
      var child = root.appendChild(randomNode(maybeText));
      // child.id = root.id + '.' + String.fromCharCode(65 + i);  // asci('A') + i.
      if (child.nodeType == Node.ELEMENT_NODE)
        randomTree(child, childDist[i]);
    }
  }

  var tagMenu = [
    'DIV',
    'SPAN',
    'P'
  ];

  function randomTagname() {
    return tagMenu[randInt(0, tagMenu.length - 1)];
  }

  var attributeMenu = [
    'foo',
    'bar',
    'baz',
    'bat',
    'bag',
    'blu',
    'coo',
    'dat'
  ];

  function randomAttributeName() {
    return attributeMenu[randInt(0, attributeMenu.length - 1)];
  }

  var textMenu = [
    'Kermit',
    'Fozzy',
    'Gonzo',
    'Piggy',
    'Professor',
    'Scooter',
    'Animal',
    'Beaker'
  ];

  function randomText() {
    return textMenu[randInt(0, textMenu.length - 1)];
  }

  function randomNode(maybeText?:boolean):Node {
    var node:Node;
    if (maybeText && !randInt(0, 8)) {
      var text = randomText();
      if (randInt(0, 1))
        node = document.createTextNode(text);
      else
        node = document.createComment(text);
    } else {
      node = document.createElement(randomTagname());
    }
    return node;
  }

  function randInt(start:number, end:number) {
    return Math.round(Math.random() * (end-start) + start);
  }

  function getReachable(root:Node, reachable:Node[], excludeRoot?:boolean) {
    if (!excludeRoot)
      reachable.push(root);
    if (!root.childNodes || ! root.childNodes.length)
      return;

    for (var child:Node = root.firstChild; child; child = child.nextSibling) {
      getReachable(child, reachable);
    }

    return;
  }

  function randomMutation(allNodes:Node[], nonRootNodes:Node[]) {

    function nodeIsDescendant(root:Node, target:Node) {
      if (!target)
        return false;
      if (root === target)
        return true;

      return nodeIsDescendant(root, target.parentNode);
    }

    function selectNodeAtRandom(nodes:Node[],
                                excludeNodeAndDescendants?:Node,
                                isElement?:boolean):Node {
      var node:Node;
      while (!node || nodeIsDescendant(excludeNodeAndDescendants, node) || (isElement && node.nodeType != Node.ELEMENT_NODE))
        node = nodes[randInt(0, nodes.length - 1)];
      return node;
    }

    function moveNode(allNodes:Node[], node:Node) {
      var parent = selectNodeAtRandom(allNodes, node, true);
      // NOTE: The random index here maybe be childNodes[childNodes.length]
      // which is undefined, meaning 'insert at end of childlist'.
      var beforeNode = parent.childNodes[randInt(0, parent.childNodes.length)];

      parent.insertBefore(node, beforeNode);
    }

    function mutateAttribute(node:Element) {
      var attrName = randomAttributeName();
      if (randInt(0, 1))
        node.setAttribute(attrName, String(randInt(0, 9)));
      else
        node.removeAttribute(attrName);
    }

    function mutateText(node:Node) {
      node.textContent = randomText();
    }

    var node = selectNodeAtRandom(nonRootNodes);

    if (randInt(0, 1)) {
      moveNode(allNodes, node);
      return;
    }

    if (node.nodeType == Node.TEXT_NODE)
      mutateText(node);
    else if (node.nodeType == Node.ELEMENT_NODE)
      mutateAttribute(<Element>node);
  }
});
