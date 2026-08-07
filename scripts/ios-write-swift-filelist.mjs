#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const iosRoot = path.join(repoRoot, "apps", "ios");
const outputPath = path.join(iosRoot, "SwiftSources.input.xcfilelist");

const iosSourceRoots = [
  "Sources",
  "ShareExtension",
  "ActivityWidget",
  path.join("WatchApp", "Sources"),
];

const sharedSwiftFiles = [
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatComposer.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatCodeHighlighter.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatInlineMath.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatLinkPreview.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatMarkdownBlockSegmenter.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatMarkdownBlockViews.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatMarkdownPreprocessor.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatMarkdownRenderer.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatMessageViews.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatModelPickerStore.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatModels.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatPayloadDecoding.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatSessions.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatSheets.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatStreamingReveal.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatTheme.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatTranscriptCache.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatTransport.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatView.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatViewModel+Attachments.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatViewModel+SessionKeys.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatViewModel+TranscriptCache.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/ChatViewModel.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawChatUI/RemoteClawMascotView.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/AnyCodable.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/BonjourEscapes.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/BonjourTypes.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/BridgeFrames.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/CameraCommands.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/CanvasA2UIAction.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/CanvasA2UICommands.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/CanvasA2UIJSONL.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/CanvasCommandParams.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/CanvasCommands.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/Capabilities.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/DeepLinks.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/JPEGTranscoder.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/NodeError.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/RemoteClawKitResources.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/ScreenCommands.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/StoragePaths.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/SystemCommands.swift",
  "../shared/RemoteClawKit/Sources/RemoteClawKit/TalkDirective.swift",
  "../swabble/Sources/SwabbleKit/WakeWordGate.swift",
];

function normalizeFileListPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function collectSwiftFiles(rootRelativePath) {
  const root = path.join(iosRoot, rootRelativePath);
  if (!existsSync(root)) {
    throw new Error(`Missing iOS Swift source root: ${rootRelativePath}`);
  }

  const entries = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".swift")) {
        entries.push(normalizeFileListPath(path.relative(iosRoot, fullPath)));
      }
    }
  };
  visit(root);
  return entries;
}

function assertSharedFilesExist(filePaths) {
  for (const filePath of filePaths) {
    const absolutePath = path.resolve(iosRoot, filePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`Missing shared Swift file listed for iOS lint: ${filePath}`);
    }
  }
}

function writeGeneratedFile(filePath, contents) {
  if (existsSync(filePath) && lstatSync(filePath).isSymbolicLink()) {
    throw new Error(`Refusing to overwrite symlinked file: ${filePath}`);
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, "utf8");
}

assertSharedFilesExist(sharedSwiftFiles);

const iosFiles = iosSourceRoots.flatMap(collectSwiftFiles);
const fileList = [...new Set([...iosFiles, ...sharedSwiftFiles])].toSorted((left, right) =>
  left.localeCompare(right),
);

writeGeneratedFile(outputPath, `${fileList.join("\n")}\n`);
process.stdout.write(`Prepared iOS Swift file list: ${path.relative(repoRoot, outputPath)}\n`);
