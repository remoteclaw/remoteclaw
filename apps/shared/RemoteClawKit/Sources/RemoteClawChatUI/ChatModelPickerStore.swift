import Foundation

public struct ChatModelPickerSections: Sendable, Equatable {
    public let pinned: [RemoteClawChatModelChoice]
    public let recent: [RemoteClawChatModelChoice]
    public let remaining: [RemoteClawChatModelChoice]
}

@MainActor
public final class ChatModelPickerStore {
    private static let favoritesKey = "remoteclaw.chat.modelFavorites"
    private static let recentsKey = "remoteclaw.chat.modelRecents"
    private static let maxRecents = 5

    private let defaults: UserDefaults

    public private(set) var favorites: [String]
    public private(set) var recents: [String]

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.favorites = defaults.stringArray(forKey: Self.favoritesKey) ?? []
        self.recents = defaults.stringArray(forKey: Self.recentsKey) ?? []
    }

    public func isFavorite(_ selectionID: String) -> Bool {
        self.favorites.contains(selectionID)
    }

    public func toggleFavorite(_ selectionID: String) {
        self.favorites = self.defaults.stringArray(forKey: Self.favoritesKey) ?? []
        if self.isFavorite(selectionID) {
            self.favorites.removeAll { $0 == selectionID }
        } else {
            self.favorites.append(selectionID)
        }
        self.defaults.set(self.favorites, forKey: Self.favoritesKey)
    }

    public func recordRecent(_ selectionID: String) {
        guard !selectionID.isEmpty, selectionID != RemoteClawChatViewModel.defaultModelSelectionID else { return }
        self.recents = self.defaults.stringArray(forKey: Self.recentsKey) ?? []
        self.recents.removeAll { $0 == selectionID }
        self.recents.insert(selectionID, at: 0)
        self.recents = Array(self.recents.prefix(Self.maxRecents))
        self.defaults.set(self.recents, forKey: Self.recentsKey)
    }

    static func sections(
        choices: [RemoteClawChatModelChoice],
        favorites: [String],
        recents: [String]) -> ChatModelPickerSections
    {
        var choicesByID: [String: RemoteClawChatModelChoice] = [:]
        for choice in choices where choicesByID[choice.selectionID] == nil {
            choicesByID[choice.selectionID] = choice
        }

        var included = Set<String>()
        let pinned = favorites.compactMap { selectionID -> RemoteClawChatModelChoice? in
            guard included.insert(selectionID).inserted else { return nil }
            return choicesByID[selectionID]
        }
        let recent = recents.compactMap { selectionID -> RemoteClawChatModelChoice? in
            guard included.insert(selectionID).inserted else { return nil }
            return choicesByID[selectionID]
        }
        let remaining = choices.filter { included.insert($0.selectionID).inserted }
        return ChatModelPickerSections(pinned: pinned, recent: recent, remaining: remaining)
    }
}
