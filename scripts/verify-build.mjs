import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_SPECIFIER_PREFIXES = ['./', '../', '/', 'http:', 'https:', 'data:'];

const isIdentifierStart = (character) => /[A-Za-z_$]/.test(character);
const isIdentifierPart = (character) => /[A-Za-z0-9_$]/.test(character);
const REGEX_PREFIX_PUNCTUATORS = new Set([
  '(', '[', '{', ',', ';', ':', '=', '!', '?', '+', '-', '*', '%', '&', '|', '^', '~', '<', '>',
]);
const REGEX_PREFIX_KEYWORDS = new Set([
  'await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'of', 'return', 'throw', 'typeof',
  'void', 'yield',
]);
const CONTROL_PAREN_KEYWORDS = new Set(['catch', 'for', 'if', 'switch', 'while', 'with']);
const BLOCK_PREFIX_KEYWORDS = new Set(['do', 'else', 'finally', 'try']);
const DECLARATION_MODIFIERS = new Set(['async', 'default', 'export']);
const STATEMENT_BOUNDARIES = new Set([';', '{', '}']);

const isDeclarationKeyword = (tokens, keywordIndex) => {
  let cursor = keywordIndex - 1;
  while (cursor >= 0 && DECLARATION_MODIFIERS.has(tokens[cursor].value)) cursor -= 1;
  return cursor < 0 || STATEMENT_BOUNDARIES.has(tokens[cursor].value);
};

const findKeywordBefore = (tokens, keyword) => {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (tokens[index].value === keyword) return index;
    if ([';', '{', '}', '=', ','].includes(tokens[index].value)) return -1;
  }
  return -1;
};

const regexCanStartAfter = (token) => !token
  || token.regexCanFollow
  || (token.type === 'punctuator' && REGEX_PREFIX_PUNCTUATORS.has(token.value))
  || (token.type === 'identifier' && REGEX_PREFIX_KEYWORDS.has(token.value));

const skipRegexLiteral = (source, start) => {
  let inCharacterClass = false;
  let index = start + 1;

  while (index < source.length) {
    if (source[index] === '\\') index += 2;
    else if (source[index] === '[') {
      inCharacterClass = true;
      index += 1;
    } else if (source[index] === ']') {
      inCharacterClass = false;
      index += 1;
    } else if (source[index] === '/' && !inCharacterClass) {
      index += 1;
      while (/[A-Za-z]/.test(source[index] ?? '')) index += 1;
      return index;
    } else index += 1;
  }

  return source.length;
};

const readString = (source, start) => {
  const quote = source[start];
  let value = '';

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') {
      value += character;
      if (index + 1 < source.length) value += source[index += 1];
    } else if (character === quote) {
      return { type: 'string', value, end: index + 1 };
    } else {
      value += character;
    }
  }

  return { type: 'string', value, end: source.length };
};

const tokenizeModuleSyntax = (source) => {
  const tokens = [];
  const parenContexts = [];
  const braceContexts = [];

  const scan = (start, stopAtTemplateExpressionEnd = false) => {
    let braceDepth = 0;

    for (let index = start; index < source.length;) {
      const character = source[index];
      const next = source[index + 1];

      if (/\s/.test(character)) {
        index += 1;
      } else if (character === '/' && next === '/') {
        index = source.indexOf('\n', index + 2);
        if (index === -1) return source.length;
      } else if (character === '/' && next === '*') {
        const end = source.indexOf('*/', index + 2);
        index = end === -1 ? source.length : end + 2;
      } else if (character === '/' && regexCanStartAfter(tokens.at(-1))) {
        index = skipRegexLiteral(source, index);
        tokens.push({ type: 'value', value: 'regex', end: index });
      } else if (character === '"' || character === "'") {
        const token = readString(source, index);
        tokens.push(token);
        index = token.end;
      } else if (character === '`') {
        const templateStart = index;
        let literal = '';
        let interpolated = false;
        let closed = false;
        index += 1;

        while (index < source.length) {
          if (source[index] === '\\') {
            literal += source[index];
            if (index + 1 < source.length) literal += source[index += 1];
            index += 1;
          } else if (source[index] === '`') {
            index += 1;
            closed = true;
            if (!interpolated) {
              tokens.push({ type: 'string', value: literal, end: index });
            }
            break;
          } else if (source[index] === '$' && source[index + 1] === '{') {
            if (!interpolated) {
              tokens.push({ type: 'string', value: literal, end: index, partial: true });
            }
            interpolated = true;
            index = scan(index + 2, true);
          } else {
            literal += source[index];
            index += 1;
          }
        }

        if (!closed && !interpolated) {
          tokens.push({ type: 'string', value: literal, end: source.length, start: templateStart });
        }
      } else if (isIdentifierStart(character)) {
        let end = index + 1;
        while (end < source.length && isIdentifierPart(source[end])) end += 1;
        tokens.push({ type: 'identifier', value: source.slice(index, end), end });
        index = end;
      } else if ((character === '+' || character === '-') && next === character) {
        tokens.push({ type: 'punctuator', value: character + next, end: index + 2 });
        index += 2;
      } else if (character === '(') {
        const previous = tokens.at(-1)?.value;
        const beforePrevious = tokens.at(-2)?.value;
        const control = (
          CONTROL_PAREN_KEYWORDS.has(previous)
          || (previous === 'await' && beforePrevious === 'for')
        );
        const functionIndex = findKeywordBefore(tokens, 'function');
        parenContexts.push({
          regexCanFollow: control,
          blockRegexCanFollow: control
            || (functionIndex >= 0 && isDeclarationKeyword(tokens, functionIndex)),
          opensFunctionBody: functionIndex >= 0,
        });
        tokens.push({ type: 'punctuator', value: character, end: index + 1 });
        index += 1;
      } else if (character === ')') {
        const context = parenContexts.pop();
        tokens.push({
          type: 'punctuator',
          value: character,
          end: index + 1,
          regexCanFollow: context?.regexCanFollow ?? false,
          blockRegexCanFollow: context?.opensFunctionBody
            ? context.blockRegexCanFollow
            : context?.regexCanFollow,
        });
        index += 1;
      } else if (character === '{') {
        braceDepth += 1;
        const previous = tokens.at(-1);
        const classIndex = findKeywordBefore(tokens, 'class');
        const blockRegexCanFollow = previous?.blockRegexCanFollow
          ?? (classIndex >= 0 ? isDeclarationKeyword(tokens, classIndex) : undefined)
          ?? (BLOCK_PREFIX_KEYWORDS.has(previous?.value)
            || !previous
            || STATEMENT_BOUNDARIES.has(previous.value));
        braceContexts.push(blockRegexCanFollow);
        tokens.push({ type: 'punctuator', value: character, end: index + 1 });
        index += 1;
      } else if (character === '}' && stopAtTemplateExpressionEnd && braceDepth === 0) {
        return index + 1;
      } else {
        if (character === '}') braceDepth -= 1;
        tokens.push({
          type: 'punctuator',
          value: character,
          end: index + 1,
          regexCanFollow: character === '}' ? (braceContexts.pop() ?? false) : false,
        });
        index += 1;
      }
    }

    return source.length;
  };

  scan(0);
  return tokens;
};

export const findBareModuleSpecifiers = (source) => {
  const tokens = tokenizeModuleSyntax(source);
  const specifiers = [];

  const addIfBare = (token) => {
    if (token?.type === 'string' && !(token.partial && token.value.length === 0)
      && !ALLOWED_SPECIFIER_PREFIXES.some((prefix) => token.value.startsWith(prefix))) {
      specifiers.push(token.value);
    }
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'identifier' || (token.value !== 'import' && token.value !== 'export')) {
      continue;
    }
    if (tokens[index - 1]?.value === '.' || tokens[index + 1]?.value === '.') continue;

    if (token.value === 'import' && tokens[index + 1]?.type === 'string') {
      addIfBare(tokens[index + 1]);
      continue;
    }

    if (token.value === 'import' && tokens[index + 1]?.value === '(') {
      addIfBare(tokens[index + 2]);
      continue;
    }

    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      if (tokens[cursor].value === ';') break;
      if (tokens[cursor].type === 'identifier'
        && tokens[cursor].value === 'from'
        && tokens[cursor + 1]?.type === 'string') {
        addIfBare(tokens[cursor + 1]);
        break;
      }
    }
  }

  return [...new Set(specifiers)];
};

const findAttribute = (attributes, name) => {
  const match = attributes.match(new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`,
    'i',
  ));
  return match?.[1] ?? match?.[2] ?? match?.[3];
};

export const findModuleScriptSources = (html) => [...html.matchAll(/<script\b([^>]*)>/gi)]
  .map((match) => match[1])
  .filter((attributes) => findAttribute(attributes, 'type')?.toLowerCase() === 'module')
  .map((attributes) => findAttribute(attributes, 'src'))
  .filter(Boolean);

const verifyBuild = async (distDirectory) => {
  const htmlPath = path.join(distDirectory, 'index.html');
  const html = await readFile(htmlPath, 'utf8');
  const scriptSources = findModuleScriptSources(html);

  if (scriptSources.length === 0) {
    throw new Error(`${htmlPath} does not reference a module entry script.`);
  }

  const failures = [];
  for (const source of scriptSources) {
    if (/^(?:https?:|data:)/.test(source)) continue;
    const scriptPath = path.join(distDirectory, source.replace(/^\//, ''));
    const script = await readFile(scriptPath, 'utf8');
    for (const specifier of findBareModuleSpecifiers(script)) {
      failures.push(`${path.relative(distDirectory, scriptPath)}: ${JSON.stringify(specifier)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Bare module specifiers remain in the browser build:\n${failures.join('\n')}`);
  }

  console.log(`Verified ${scriptSources.length} browser entry script(s): no bare module specifiers.`);
};

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  verifyBuild(path.resolve(process.argv[2] ?? 'dist')).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
